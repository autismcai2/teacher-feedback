import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import OpenAI from "openai";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

function extractJson(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : trimmed);
}

app.post("/api/generate-feedback", async (req, res) => {
  try {
    const { rawText, style = "温和鼓励" } = req.body;

    if (!rawText || !rawText.trim()) {
      return res.status(400).json({ error: "请输入课堂记录。" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "缺少 OPENAI_API_KEY，请先在 .env 中配置。" });
    }

    const prompt = `
你是一名教培机构老师的课后反馈助手。

请根据用户输入的一段课堂记录，提取并生成以下内容：
- studentName：学生姓名。如果原文没有明确姓名，写“同学”。
- courseName：课程名称。如果原文没有明确课程，请根据内容合理推测。
- todayContent：今日教学内容。
- keyPoints：本节课重点。
- difficultPoints：本节课难点。
- absorption：学生吸收情况。
- classroomPerformance：课堂表现。
- homework：作业布置。如果原文没有提到，写“暂无明确作业安排”。
- nextSuggestion：后续学习建议。
- parentFeedback：一段可以直接发给家长的反馈话术。

话术风格：${style}

要求：
- 语言自然，适合老师发给家长。
- 不要过度夸张，也不要只写空泛套话。
- 必须只返回 JSON，不要返回解释、Markdown 或代码块。
- JSON 的 key 必须严格使用上面列出的英文 key。

用户输入：
${rawText}
`;

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      input: prompt,
    });

    const data = extractJson(response.output_text || "");
    res.json({ ...fallbackResult, ...data });
  } catch (error) {
    console.error(error);

    if (
      error?.name === "APIConnectionTimeoutError" ||
      error?.constructor?.name === "APIConnectionTimeoutError" ||
      error?.message?.toLowerCase().includes("timed out")
    ) {
      return res.status(504).json({
        error:
          "连接 OpenAI 超时。请检查网络/代理，或在 .env 中配置可访问的 OPENAI_BASE_URL。",
      });
    }

    res.status(500).json({
      error: error?.message || "AI 生成失败，请检查 API Key、模型名称或网络连接。",
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
