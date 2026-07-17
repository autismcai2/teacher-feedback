import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");
const studentsFile = path.join(dataDir, "students.json");
const lessonsFile = path.join(dataDir, "lessons.json");
const groupClassesFile = path.join(dataDir, "group-classes.json");
const groupLessonsFile = path.join(dataDir, "group-lessons.json");
const defaultTeacherName = "陈思桦";
const studentTeacherColumn = "teacher_name";
const studentLessonColumn = "last_lesson_number";
const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL);
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseKey);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  timeout: 120000,
});

const aiProvider = normalizeAiProvider(process.env.AI_PROVIDER);
const anthropicBaseUrl = normalizeApiBaseUrl(process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com");
const anthropicVersion = process.env.ANTHROPIC_VERSION || "2023-06-01";

const fallbackResult = {
  studentName: "同学",
  courseName: "",
  todayContent: "",
  keyPoints: "",
  difficultPoints: "",
  absorption: "",
  classroomPerformance: "",
  homework: "",
  nextSuggestion: "",
  parentFeedback: "",
};

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    storage: useSupabase ? "supabase" : "local",
    aiProvider,
    aiModel: aiProvider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"
      : process.env.OPENAI_MODEL || "gpt-5.5",
  });
});

app.get("/api/keepalive", async (req, res) => {
  try {
    if (useSupabase) {
      await supabaseRequest("/students?select=name&limit=1");
    }

    res.json({
      ok: true,
      storage: useSupabase ? "supabase" : "local",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("保持数据库在线", error) });
  }
});

function normalizeSupabaseUrl(value) {
  if (!value) return "";

  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
}

function validateSupabaseUrl(value) {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL 格式不正确，请填写项目根地址，格式类似 https://xxxx.supabase.co。");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") || parsed.pathname !== "/") {
    throw new Error("SUPABASE_URL 格式不正确，请填写项目根地址，格式类似 https://xxxx.supabase.co。");
  }
}

function publicStorageError(action, error) {
  const message = error?.message || "未知错误";
  const lower = message.toLowerCase();

  if (
    lower.includes("could not find the table") ||
    lower.includes("relation") ||
    lower.includes("schema cache")
  ) {
    if (lower.includes(studentTeacherColumn)) {
      return `${action}失败：Supabase 的 public.students 表还没有 ${studentTeacherColumn} 字段。请先运行 README 里的老师分组升级 SQL。`;
    }

    if (lower.includes(studentLessonColumn)) {
      return `${action}失败：Supabase 的 public.students 表还没有 ${studentLessonColumn} 字段。请先运行 README 里的课次记忆升级 SQL。`;
    }

    return `${action}失败：Supabase 里可能还没有创建 public.students 表。请先运行建表 SQL。`;
  }

  if (lower.includes("jwt") || lower.includes("permission") || lower.includes("unauthorized")) {
    return `${action}失败：Supabase key 可能填错了。请使用 service_role key 或 secret key，不要使用 anon key。`;
  }

  if (lower.includes("fetch failed") || lower.includes("invalid url") || lower.includes("enotfound")) {
    return `${action}失败：SUPABASE_URL 可能填错了，请确认格式类似 https://xxxx.supabase.co。`;
  }

  if (lower.includes("invalid path specified")) {
    return `${action}失败：SUPABASE_URL 请填写项目根地址，格式类似 https://xxxx.supabase.co，不要填写 /rest/v1 结尾的地址。`;
  }

  return `${action}失败：${message}`;
}

async function ensureStudentStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(studentsFile);
  } catch {
    await fs.writeFile(studentsFile, "[]\n", "utf8");
  }
}

async function ensureLessonsStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(lessonsFile);
  } catch {
    await fs.writeFile(lessonsFile, "[]\n", "utf8");
  }
}

function normalizeLessonRecord(value) {
  const teacherName = normalizeTeacherName(value?.teacherName);
  const studentName = String(value?.studentName || "").trim();
  const lessonNumber = normalizeLessonNumber(value?.lessonNumber);

  if (!studentName || lessonNumber < 1) return null;

  return {
    teacherName,
    studentName,
    lessonNumber,
    classDate: String(value?.classDate || "").trim(),
    classTime: String(value?.classTime || "").trim(),
    attendance: String(value?.attendance || "").trim(),
    homeworkStatus: String(value?.homeworkStatus || "").trim(),
    seriousness: normalizeLessonNumber(value?.seriousness),
    interaction: normalizeLessonNumber(value?.interaction),
    rawText: String(value?.rawText || "").trim(),
    feedback: value?.feedback && typeof value.feedback === "object" ? value.feedback : {},
    updatedAt: new Date().toISOString(),
  };
}

function lessonRecordKey(record) {
  return `${record.teacherName}\u0000${record.studentName}\u0000${record.lessonNumber}`;
}

async function saveLessonRecord(value) {
  const record = normalizeLessonRecord(value);
  if (!record) throw new Error("班课记录缺少学生姓名或有效课次。");

  if (useSupabase) {
    await supabaseRequest("/lesson_records?on_conflict=teacher_name,student_name,lesson_number", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        teacher_name: record.teacherName,
        student_name: record.studentName,
        lesson_number: record.lessonNumber,
        class_date: record.classDate || null,
        class_time: record.classTime,
        attendance: record.attendance,
        homework_status: record.homeworkStatus,
        seriousness: record.seriousness,
        interaction: record.interaction,
        raw_text: record.rawText,
        feedback: record.feedback,
        updated_at: record.updatedAt,
      }),
    });
    return record;
  }

  await ensureLessonsStore();
  const text = await fs.readFile(lessonsFile, "utf8");
  const records = JSON.parse(text || "[]");
  const key = lessonRecordKey(record);
  const next = records.filter((item) => lessonRecordKey(item) !== key);
  next.push(record);
  next.sort((a, b) => lessonRecordKey(a).localeCompare(lessonRecordKey(b), "zh-Hans-CN"));
  await fs.writeFile(lessonsFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return record;
}

async function ensureJsonStore(file) {
  await fs.mkdir(dataDir, { recursive: true });
  try { await fs.access(file); } catch { await fs.writeFile(file, "[]\n", "utf8"); }
}

function normalizeGroupClass(value) {
  return {
    id: String(value?.id || randomUUID()),
    teacherName: normalizeTeacherName(value?.teacherName ?? value?.teacher_name),
    classInfo: String(value?.classInfo || value?.class_info || "").trim(),
    defaultTime: String(value?.defaultTime || value?.default_time || "13:10-15:10").trim(),
    lastLessonNumber: normalizeLessonNumber(value?.lastLessonNumber ?? value?.last_lesson_number),
    students: (Array.isArray(value?.students) ? value.students : []).map((item) => String(item?.name || item).trim()).filter(Boolean),
  };
}

async function readGroupClasses(teacherName) {
  if (useSupabase) {
    const classes = await supabaseRequest(`/group_classes?teacher_name=eq.${encodeURIComponent(teacherName)}&select=id,teacher_name,class_info,default_time,last_lesson_number&order=created_at.asc`);
    const ids = classes.map((item) => item.id);
    const members = ids.length ? await supabaseRequest(`/group_class_students?class_id=in.(${ids.map(encodeURIComponent).join(",")})&select=class_id,name,display_order&order=display_order.asc`) : [];
    return classes.map((item) => normalizeGroupClass({ ...item, students: members.filter((member) => member.class_id === item.id).map((member) => member.name) }));
  }
  await ensureJsonStore(groupClassesFile);
  const records = JSON.parse(await fs.readFile(groupClassesFile, "utf8") || "[]");
  return records.map(normalizeGroupClass).filter((item) => item.teacherName === teacherName);
}

async function createGroupClassRecord(value) {
  const record = normalizeGroupClass(value);
  if (!record.classInfo) throw new Error("请输入班级信息。");
  if (useSupabase) {
    await supabaseRequest("/group_classes", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: record.id, teacher_name: record.teacherName, class_info: record.classInfo, default_time: record.defaultTime, last_lesson_number: 0 }) });
    return record;
  }
  await ensureJsonStore(groupClassesFile);
  const records = JSON.parse(await fs.readFile(groupClassesFile, "utf8") || "[]");
  records.push(record);
  await fs.writeFile(groupClassesFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return record;
}

async function updateGroupClassRecord(id, value) {
  const students = (Array.isArray(value?.students) ? value.students : []).map((item) => String(item?.name || item).trim()).filter(Boolean);
  if (useSupabase) {
    await supabaseRequest(`/group_classes?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ class_info: String(value?.classInfo || "").trim(), default_time: String(value?.defaultTime || "").trim() }) });
    await supabaseRequest(`/group_class_students?class_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    if (students.length) await supabaseRequest("/group_class_students", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(students.map((name, display_order) => ({ class_id: id, name, display_order }))) });
  } else {
    await ensureJsonStore(groupClassesFile);
    const records = JSON.parse(await fs.readFile(groupClassesFile, "utf8") || "[]");
    const next = records.map((item) => item.id === id ? { ...item, classInfo: value.classInfo, defaultTime: value.defaultTime, students } : item);
    await fs.writeFile(groupClassesFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }
  return { id, students };
}

async function deleteGroupClassRecord(id) {
  if (useSupabase) {
    await supabaseRequest(`/group_classes?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  } else {
    await ensureJsonStore(groupClassesFile);
    const records = JSON.parse(await fs.readFile(groupClassesFile, "utf8") || "[]");
    await fs.writeFile(groupClassesFile, `${JSON.stringify(records.filter((item) => item.id !== id), null, 2)}\n`, "utf8");
    await ensureJsonStore(groupLessonsFile);
    const lessons = JSON.parse(await fs.readFile(groupLessonsFile, "utf8") || "[]");
    await fs.writeFile(groupLessonsFile, `${JSON.stringify(lessons.filter((item) => item.classId !== id), null, 2)}\n`, "utf8");
  }
}

async function saveGroupLessonRecord(value) {
  const classId = String(value?.classId || "").trim();
  const lessonNumber = normalizeLessonNumber(value?.lessonNumber);
  if (!classId || lessonNumber < 1) throw new Error("整节班课缺少班级或有效课次。");
  const record = { ...value, classId, lessonNumber, teacherName: normalizeTeacherName(value?.teacherName), updatedAt: new Date().toISOString() };
  if (useSupabase) {
    await supabaseRequest("/group_lesson_records?on_conflict=class_id,lesson_number", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ class_id: classId, teacher_name: record.teacherName, lesson_number: lessonNumber, class_date: record.classDate || null, class_time: record.classTime || "", raw_text: record.rawText || "", teaching_content: record.teachingContent || "", difficult_points: record.difficultPoints || "", absorption: record.absorption || "", homework: record.homework || "", students: record.students || [], updated_at: record.updatedAt }) });
    await supabaseRequest(`/group_classes?id=eq.${encodeURIComponent(classId)}`, { method: "PATCH", body: JSON.stringify({ last_lesson_number: lessonNumber }) });
  } else {
    await ensureJsonStore(groupLessonsFile);
    const records = JSON.parse(await fs.readFile(groupLessonsFile, "utf8") || "[]");
    const next = records.filter((item) => !(item.classId === classId && item.lessonNumber === lessonNumber));
    next.push(record);
    await fs.writeFile(groupLessonsFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await ensureJsonStore(groupClassesFile);
    const classes = JSON.parse(await fs.readFile(groupClassesFile, "utf8") || "[]");
    await fs.writeFile(groupClassesFile, `${JSON.stringify(classes.map((item) => item.id === classId ? { ...item, lastLessonNumber: lessonNumber } : item), null, 2)}\n`, "utf8");
  }
  return record;
}

function normalizeLessonNumber(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  const normalized = Math.floor(number);
  return normalized >= 0 ? normalized : fallback;
}

function normalizeTeacherName(value) {
  return String(value || defaultTeacherName).trim() || defaultTeacherName;
}

function normalizeStudentRecord(student) {
  if (typeof student === "string") {
    const name = student.trim();
    return name ? { teacherName: defaultTeacherName, name, lastLessonNumber: 0 } : null;
  }

  if (!student || typeof student !== "object") return null;

  const name = String(student.name || "").trim();
  if (!name) return null;

  return {
    teacherName: normalizeTeacherName(student.teacherName ?? student[studentTeacherColumn]),
    name,
    lastLessonNumber: normalizeLessonNumber(student.lastLessonNumber ?? student[studentLessonColumn]),
  };
}

function uniqueStudentRecords(students) {
  const recordMap = new Map();

  for (const student of students) {
    const record = normalizeStudentRecord(student);
    if (!record) continue;

    const recordKey = `${record.teacherName}\u0000${record.name}`;
    const existing = recordMap.get(recordKey);
    recordMap.set(recordKey, {
      teacherName: record.teacherName,
      name: record.name,
      lastLessonNumber: Math.max(existing?.lastLessonNumber || 0, record.lastLessonNumber || 0),
    });
  }

  return [...recordMap.values()].sort((a, b) => {
    const teacherSort = a.teacherName.localeCompare(b.teacherName, "zh-Hans-CN");
    return teacherSort || a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}

function buildStudentsPayload(records, teacherName = defaultTeacherName) {
  const normalizedTeacherName = normalizeTeacherName(teacherName);
  const normalized = uniqueStudentRecords(records).filter(
    (student) => student.teacherName === normalizedTeacherName,
  );
  const studentLessons = Object.fromEntries(
    normalized
      .filter((student) => student.lastLessonNumber > 0)
      .map((student) => [student.name, student.lastLessonNumber]),
  );

  return {
    teacherName: normalizedTeacherName,
    students: normalized.map((student) => student.name),
    studentLessons,
    storage: useSupabase ? "supabase" : "local",
  };
}

function isMissingColumn(error, columnName) {
  const lower = String(error?.message || "").toLowerCase();
  return lower.includes(columnName);
}

async function supabaseRequest(pathname, options = {}) {
  validateSupabaseUrl(supabaseUrl);

  const response = await fetch(`${supabaseUrl}/rest/v1${pathname}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase 请求失败：${response.status}`);
  }

  return data;
}

async function readStudentRecords() {
  if (useSupabase) {
    try {
      const data = await supabaseRequest(
        `/students?select=${studentTeacherColumn},name,${studentLessonColumn}&order=${studentTeacherColumn}.asc,name.asc`,
      );
      return uniqueStudentRecords(data);
    } catch (error) {
      if (isMissingColumn(error, studentTeacherColumn)) {
        try {
          const data = await supabaseRequest(`/students?select=name,${studentLessonColumn}&order=name.asc`);
          return uniqueStudentRecords(data);
        } catch (fallbackError) {
          if (!isMissingColumn(fallbackError, studentLessonColumn)) throw fallbackError;

          const data = await supabaseRequest("/students?select=name&order=name.asc");
          return uniqueStudentRecords(data);
        }
      }

      if (isMissingColumn(error, studentLessonColumn)) {
        const data = await supabaseRequest(
          `/students?select=${studentTeacherColumn},name&order=${studentTeacherColumn}.asc,name.asc`,
        );
        return uniqueStudentRecords(data);
      }

      throw error;
    }
  }

  await ensureStudentStore();
  const text = await fs.readFile(studentsFile, "utf8");
  const parsed = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? uniqueStudentRecords(parsed) : [];
}

async function writeStudentRecords(students) {
  await ensureStudentStore();
  const unique = uniqueStudentRecords(students);
  await fs.writeFile(studentsFile, `${JSON.stringify(unique, null, 2)}\n`, "utf8");
  return unique;
}

async function addStudentName(teacherName, name) {
  const normalizedTeacherName = normalizeTeacherName(teacherName);

  if (!useSupabase) {
    const students = await readStudentRecords();
    return writeStudentRecords([...students, { teacherName: normalizedTeacherName, name, lastLessonNumber: 0 }]);
  }

  await supabaseRequest("/students", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ [studentTeacherColumn]: normalizedTeacherName, name }),
  });

  const students = await readStudentRecords();
  const exists = students.some((student) => student.teacherName === normalizedTeacherName && student.name === name);

  if (!exists) {
    throw new Error("保存学生姓名失败：请先运行 README 里的老师分组升级 SQL，允许不同老师拥有同名学生。");
  }

  return students;
}

async function deleteStudentName(teacherName, name) {
  const normalizedTeacherName = normalizeTeacherName(teacherName);

  if (!useSupabase) {
    const students = await readStudentRecords();
    return writeStudentRecords(
      students.filter((student) => student.teacherName !== normalizedTeacherName || student.name !== name),
    );
  }

  await supabaseRequest(
    `/students?${studentTeacherColumn}=eq.${encodeURIComponent(normalizedTeacherName)}&name=eq.${encodeURIComponent(name)}`,
    {
      method: "DELETE",
    },
  );

  return readStudentRecords();
}

async function updateStudentLessonNumber(teacherName, name, lessonNumber) {
  const normalizedTeacherName = normalizeTeacherName(teacherName);
  const lastLessonNumber = normalizeLessonNumber(lessonNumber);

  if (!useSupabase) {
    const students = await readStudentRecords();
    const existing = students.find(
      (student) => student.teacherName === normalizedTeacherName && student.name === name,
    );
    const nextStudents = existing
      ? students.map((student) =>
          student.teacherName === normalizedTeacherName && student.name === name
            ? { ...student, lastLessonNumber }
            : student,
        )
      : [...students, { teacherName: normalizedTeacherName, name, lastLessonNumber }];

    return writeStudentRecords(nextStudents);
  }

  await supabaseRequest(
    `/students?${studentTeacherColumn}=eq.${encodeURIComponent(normalizedTeacherName)}&name=eq.${encodeURIComponent(name)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ [studentLessonColumn]: lastLessonNumber }),
    },
  );

  return readStudentRecords();
}

function extractJson(text) {
  const trimmed = String(text || "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue below and extract the first complete JSON object from model text.
  }

  const start = trimmed.indexOf("{");

  if (start === -1) {
    throw new Error("AI 返回内容不是有效 JSON。");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(trimmed.slice(start, i + 1));
      }
    }
  }

  throw new Error("AI 返回的 JSON 不完整，请重新生成一次。");
}

function cleanLeadingPunctuation(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(/^[，。；;、：:\s]+/, "");
}

function cleanFeedbackData(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, cleanLeadingPunctuation(value)]),
  );
}

function normalizeAiProvider(value) {
  const provider = String(value || "").trim().toLowerCase();

  if (provider === "anthropic" || provider === "claude") return "anthropic";
  if (provider === "openai") return "openai";
  if (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) return "anthropic";
  return "openai";
}

function normalizeApiBaseUrl(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function getMissingAiConfig() {
  if (aiProvider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? "" : "缺少 ANTHROPIC_API_KEY，请先配置 Claude API Key。";
  }

  return process.env.OPENAI_API_KEY ? "" : "缺少 OPENAI_API_KEY，请先配置 OpenAI/New API Key。";
}

function extractAnthropicText(data) {
  if (!Array.isArray(data?.content)) return "";

  return data.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

async function generateAiText(prompt) {
  if (aiProvider === "anthropic") {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${anthropicBaseUrl}/v1/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": anthropicVersion,
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS || 4096),
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const text = await response.text();
      let data;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(
          `Claude API 返回的不是 JSON。请检查 ANTHROPIC_BASE_URL 是否为接口地址，不要填控制台/网页地址。返回片段：${text.slice(0, 160)}`,
        );
      }

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || `Claude API 请求失败：${response.status}`);
      }

      return extractAnthropicText(data);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    input: prompt,
  });

  return response.output_text || "";
}

app.get("/api/students", async (req, res) => {
  try {
    const teacherName = normalizeTeacherName(req.query?.teacherName);
    res.json(buildStudentsPayload(await readStudentRecords(), teacherName));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("读取学生名单", error) });
  }
});

app.post("/api/students", async (req, res) => {
  try {
    const teacherName = normalizeTeacherName(req.body?.teacherName);
    const name = String(req.body?.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "请输入学生姓名。" });
    }

    if (name.length > 20) {
      return res.status(400).json({ error: "学生姓名不能超过 20 个字符。" });
    }

    res.json(buildStudentsPayload(await addStudentName(teacherName, name), teacherName));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("保存学生姓名", error) });
  }
});

app.delete("/api/students/:name", async (req, res) => {
  try {
    const teacherName = normalizeTeacherName(req.query?.teacherName);
    const name = String(req.params.name || "").trim();
    res.json(buildStudentsPayload(await deleteStudentName(teacherName, name), teacherName));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("删除学生姓名", error) });
  }
});

app.patch("/api/students/:name/lesson", async (req, res) => {
  try {
    const teacherName = normalizeTeacherName(req.body?.teacherName || req.query?.teacherName);
    const name = String(req.params.name || "").trim();
    const lessonNumber = normalizeLessonNumber(req.body?.lessonNumber);

    if (!name) {
      return res.status(400).json({ error: "请先选择学生。" });
    }

    if (lessonNumber < 1) {
      return res.status(400).json({ error: "课次必须是大于 0 的数字。" });
    }

    res.json(buildStudentsPayload(await updateStudentLessonNumber(teacherName, name, lessonNumber), teacherName));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("保存学生课次", error) });
  }
});

app.get("/api/group-classes", async (req, res) => {
  try {
    const teacherName = normalizeTeacherName(req.query?.teacherName);
    res.json({ classes: await readGroupClasses(teacherName), storage: useSupabase ? "supabase" : "local" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("读取班级", error) });
  }
});

app.post("/api/group-classes", async (req, res) => {
  try {
    const record = await createGroupClassRecord(req.body);
    res.json({ class: record, storage: useSupabase ? "supabase" : "local" });
  } catch (error) {
    res.status(400).json({ error: error?.message || "创建班级失败" });
  }
});

app.patch("/api/group-classes/:id", async (req, res) => {
  try {
    res.json({ ok: true, class: await updateGroupClassRecord(req.params.id, req.body) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("更新班级名单", error) });
  }
});

app.delete("/api/group-classes/:id", async (req, res) => {
  try {
    await deleteGroupClassRecord(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: publicStorageError("删除班级", error) });
  }
});

app.post("/api/group-lessons", async (req, res) => {
  try {
    res.json({ ok: true, lesson: await saveGroupLessonRecord(req.body), storage: useSupabase ? "supabase" : "local" });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error?.message || "保存整节班课失败" });
  }
});

app.post("/api/lessons", async (req, res) => {
  try {
    const lesson = await saveLessonRecord(req.body);
    await updateStudentLessonNumber(lesson.teacherName, lesson.studentName, lesson.lessonNumber);
    res.json({ ok: true, lesson, storage: useSupabase ? "supabase" : "local" });
  } catch (error) {
    console.error(error);
    const message = String(error?.message || "");
    const status = message.includes("缺少学生姓名") ? 400 : 500;
    res.status(status).json({ error: publicStorageError("保存班课记录", error) });
  }
});

app.post("/api/generate-group-feedback", async (req, res) => {
  try {
    const { rawText = "", classInfo = "", students = [] } = req.body || {};
    if (!String(rawText).trim()) return res.status(400).json({ error: "请输入整班课堂记录。" });
    const missingAiConfig = getMissingAiConfig();
    if (missingAiConfig) return res.status(500).json({ error: missingAiConfig });
    const prompt = `你是教培机构班课老师。请根据整班课堂记录生成严格JSON，不要Markdown。\n班级：${classInfo}\n课堂记录：${rawText}\n学生数据：${JSON.stringify(students)}\n输出格式：{"teachingContent":"","difficultPoints":"","absorption":"","homework":"","students":[{"name":"","performanceComment":""}]}。要求：公共内容具体；absorption必须包含4个编号段落，兼顾整体和个人；每名学生只写一句20-50字课堂表现，表达互不重复；已有quickNote必须忠实润色，空白时可生成一般性、非虚构的多样化描述；不得修改姓名、出勤、作业和分数。`;
    const parsed = extractJson(await generateAiText(prompt));
    const comments = new Map((Array.isArray(parsed.students) ? parsed.students : []).map((item) => [String(item.name), String(item.performanceComment || "").trim()]));
    res.json({
      teachingContent: String(parsed.teachingContent || "").trim(),
      difficultPoints: String(parsed.difficultPoints || "").trim(),
      absorption: String(parsed.absorption || "").trim(),
      homework: String(parsed.homework || "").trim(),
      students: students.map((item) => ({ name: item.name, performanceComment: comments.get(String(item.name)) || String(item.quickNote || "").trim() })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || "生成班课反馈失败" });
  }
});

app.post("/api/generate-feedback", async (req, res) => {
  try {
    const { rawText, style = "温和鼓励", meta = {} } = req.body;

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "请输入课堂记录。" });
    }

    const missingAiConfig = getMissingAiConfig();
    if (missingAiConfig) {
      return res.status(500).json({ error: missingAiConfig });
    }

    const prompt = `
你是一名经验丰富的教培机构老师，正在帮任课老师整理一份“课后反馈表”和“发给家长的课堂反馈”。

请根据用户输入的课堂记录，生成结构化 JSON。你不能只做简单概括，必须把“学生表现/吸收情况/家长反馈”与“本节课具体学习内容”融合在一起。

输出字段：
- studentName：学生姓名。原文没有明确姓名时写“同学”。
- courseName：课程名称。原文没有明确课程时，根据内容合理推测。
- todayContent：今日教学内容。写成一段完整内容，80-160 字，要包含本节课讲了什么、练了什么、围绕哪些知识点展开。
- keyPoints：本节课重点。用“1. ...；2. ...；3. ...”这样的编号格式组织，开头不要加分号或其他标点，120-220 字，要具体到知识点、方法、题型或解题步骤。
- difficultPoints：本节课难点。120-220 字，要说明学生容易卡在哪里，不能只写“综合运用较难”。
- absorption：学生吸收情况。180-300 字，必须结合 todayContent/keyPoints/difficultPoints 来写：哪些内容吸收较好，哪些内容还需要练习，原因是什么，后续如何巩固。不要写空泛评价。
- classroomPerformance：学生课堂表现。只写一句话，约 20-50 字，不要分点，不要展开成长段；只保留专注度、互动、答题或思路跟进中最关键的表现。如果原文没有提到，要基于课堂记录谨慎表达，不要编造。
- homework：作业布置。原文有作业就按原文整理；没有提到时写“暂无明确作业安排，建议围绕本节重点进行针对性巩固。”
- nextSuggestion：后续学习建议。120-220 字，必须给出和本节课内容对应的具体练习建议。
- parentFeedback：可直接发给家长的一段话。220-380 字，语气自然，必须包含今天学习的具体内容、孩子掌握情况、当前还需加强的具体点、作业或课后巩固建议。

话术风格：${style}

写作要求：
- 不要机械套模板，不要只写“基础较好、继续努力”这类空话。
- 如果原始记录信息很少，可以合理补充“建议性表达”，但不要编造具体成绩、排名或不存在的课堂事件。
- 内容要适合老师发给家长，客观、具体、温和。
- 必须只返回 JSON，不要返回解释、Markdown 或代码块。
- JSON 的 key 必须严格使用上面列出的英文 key。

用户输入：
${rawText}

已确认班课信息（优先于从原文推断）：
${JSON.stringify({
  studentName: meta.studentName || "",
  teacherName: meta.teacherName || "",
  lessonNumber: meta.lessonNumber || "",
  classDate: meta.classDate || "",
  classTime: meta.classTime || "",
})}
`;

    const data = cleanFeedbackData(extractJson(await generateAiText(prompt)));
    res.json({ ...fallbackResult, ...data });
  } catch (error) {
    console.error(error);

    const message = error?.message || "";

    if (
      error?.name === "AbortError" ||
      error?.name === "APIConnectionTimeoutError" ||
      error?.constructor?.name === "APIConnectionTimeoutError" ||
      message.toLowerCase().includes("timed out")
    ) {
      return res.status(504).json({
        error: "连接 AI 接口超时。请检查 OPENAI_BASE_URL/ANTHROPIC_BASE_URL、网络，或确认转发服务可访问。",
      });
    }

    if (error?.status === 503 && message.toLowerCase().includes("no available channel")) {
      return res.status(503).json({
        error:
          "当前 API 分组没有可用的模型通道。请在部署平台环境变量中删除 OPENAI_MODEL，或改成 ikuncode 支持的模型，例如 gpt-5.5。",
      });
    }

    res.status(500).json({
      error: message || "AI 生成失败，请检查 API Key、模型名称或网络连接。",
    });
  }
});

app.use(express.static(path.join(__dirname, "dist")));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`AI backend running at http://localhost:${port}`);
});
