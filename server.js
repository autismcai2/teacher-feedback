import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
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
  });
});

function normalizeSupabaseUrl(value) {
  if (!value) return "";

  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");
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

app.post("/api/generate-feedback", async (req, res) => {
  try {
    const { rawText, style = "温和鼓励" } = req.body;

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "请输入课堂记录。" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "缺少 OPENAI_API_KEY，请先配置环境变量。" });
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
- classroomPerformance：课堂表现。80-160 字，结合课堂专注度、互动、答题、思路跟进情况来写；如果原文没有提到，要基于课堂记录谨慎推断。
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
`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: prompt,
    });

    const data = cleanFeedbackData(extractJson(response.output_text || ""));
    res.json({ ...fallbackResult, ...data });
  } catch (error) {
    console.error(error);

    const message = error?.message || "";

    if (
      error?.name === "APIConnectionTimeoutError" ||
      error?.constructor?.name === "APIConnectionTimeoutError" ||
      message.toLowerCase().includes("timed out")
    ) {
      return res.status(504).json({
        error: "连接 AI 接口超时。请检查 OPENAI_BASE_URL、网络，或确认转发服务可访问。",
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
