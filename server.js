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
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
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

async function ensureStudentStore() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(studentsFile);
  } catch {
    await fs.writeFile(studentsFile, "[]\n", "utf8");
  }
}

async function readStudents() {
  if (useSupabase) {
    const data = await supabaseRequest("/students?select=name&order=name.asc");
    return data.map((student) => student.name).filter(Boolean);
  }

  await ensureStudentStore();
  const text = await fs.readFile(studentsFile, "utf8");
  const parsed = JSON.parse(text || "[]");
  return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
}

async function writeStudents(students) {
  await ensureStudentStore();
  const unique = [...new Set(students.map((name) => String(name).trim()).filter(Boolean))];
  unique.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  await fs.writeFile(studentsFile, `${JSON.stringify(unique, null, 2)}\n`, "utf8");
  return unique;
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
    throw new Error(data?.message || data?.error || "Supabase 请求失败。");
  }

  return data;
}

async function addStudentName(name) {
  if (!useSupabase) {
    const students = await readStudents();
    return writeStudents([...students, name]);
  }

  await supabaseRequest("/students", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates",
    },
    body: JSON.stringify({ name }),
  });

  return readStudents();
}

async function deleteStudentName(name) {
  if (!useSupabase) {
    const students = await readStudents();
    return writeStudents(students.filter((student) => student !== name));
  }

  await supabaseRequest(`/students?name=eq.${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

  return readStudents();
}

function extractJson(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
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
    res.json({ students: await readStudents() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "读取学生名单失败。" });
  }
});

app.post("/api/students", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();

    if (!name) {
      return res.status(400).json({ error: "请输入学生姓名。" });
    }

    if (name.length > 20) {
      return res.status(400).json({ error: "学生姓名不能超过 20 个字符。" });
    }

    res.json({ students: await addStudentName(name) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "保存学生姓名失败。" });
  }
});

app.delete("/api/students/:name", async (req, res) => {
  try {
    const name = String(req.params.name || "").trim();
    res.json({ students: await deleteStudentName(name) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "删除学生姓名失败。" });
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
