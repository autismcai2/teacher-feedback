import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { analysisKeys } from "../feedback-analysis.js";

test("analysis and generation APIs exchange dynamic questions and review metadata", async (t) => {
  const outputs = [];
  const prompts = [];
  const fakeAi = http.createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    prompts.push(JSON.parse(text).messages[0].content);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(outputs.shift()) }] }));
  });
  fakeAi.listen(0, "127.0.0.1");
  await once(fakeAi, "listening");
  t.after(() => { fakeAi.closeAllConnections(); fakeAi.close(); });
  const portProbe = http.createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const child = spawn(process.execPath, ["server.js"], {
    env: { ...process.env, PORT: String(port), AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-only", OPENAI_API_KEY: "test-only", ANTHROPIC_BASE_URL: `http://127.0.0.1:${fakeAi.address().port}`, SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    child.kill();
    await once(child, "exit");
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test backend did not start")), 8000);
    child.stdout.on("data", (chunk) => { if (chunk.toString().includes("AI backend running")) { clearTimeout(timer); resolve(); } });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Test backend exited ${code}`)); });
  });
  async function post(path, body) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  function fixture(mode, missing) {
    return { fields: analysisKeys(mode).map((key) => ({ key, status: missing.includes(key) ? "missing" : "provided", evidence: "来源于课堂记录", question: missing.includes(key) ? `请补充本节课的${key}` : "" })) };
  }

  await t.test("one-to-one analyzes all sections, then generates using actual supplements", async () => {
    outputs.push(fixture("one-to-one", ["todayContent", "difficultPoints", "homework"]));
    const context = { rawText: "数学 三角函数 做了随堂训练效果可以", meta: { studentName: "小李", homeworkStatus: "已完成", seriousness: 4, interaction: 3 } };
    const analyzed = await post("/api/analyze-feedback", context);
    assert.equal(analyzed.status, 200);
    assert.deepEqual(analyzed.body.questions.map((field) => field.key), ["todayContent", "difficultPoints", "homework"]);
    assert.match(prompts.at(-1), /小李/);
    outputs.push({ todayContent: "三角函数基础", parentFeedback: "基础练习较顺畅", homework: "本节不布置作业" });
    const generated = await post("/api/generate-feedback", { ...context, analysis: analyzed.body, supplementalDetails: { todayContent: "正弦余弦定义", homework: "本节不布置作业" } });
    assert.equal(generated.status, 200);
    assert.match(prompts.at(-1), /正弦余弦定义/);
    assert.match(prompts.at(-1), /认真程度与互动性采用1—5星/);
    assert.deepEqual(generated.body.generationInfo.autoCompletedFields.map((field) => field.key), ["difficultPoints"]);
  });

  await t.test("complete records return no questions", async () => {
    outputs.push(fixture("one-to-one", []));
    const result = await post("/api/analyze-feedback", { rawText: "完整课堂记录" });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.questions, []);
  });

  await t.test("group analysis respects its field set and skipped details are listed for review", async () => {
    outputs.push(fixture("group-class", ["absorption", "homework"]));
    const context = { mode: "group-class", rawText: "今天练习配方法", classInfo: "初三数学", students: [{ name: "小李", attendance: "请假", quickNote: "", score: "", homeworkStatus: "未完成" }] };
    const analyzed = await post("/api/analyze-feedback", context);
    assert.equal(analyzed.status, 200);
    assert.equal(analyzed.body.fields.length, analysisKeys("group-class").length);
    outputs.push({ teachingContent: "配方法", students: [{ name: "小李", performanceComment: "本次请假，课后补习" }] });
    const result = await post("/api/generate-group-feedback", { ...context, analysis: analyzed.body, supplementalDetails: {} });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.generationInfo.autoCompletedFields.map((field) => field.key), ["absorption", "homework"]);
    assert.match(prompts.at(-1), /缺席学生不得生成课堂答题或在场表现/);
  });

  await t.test("malformed analysis produces a visible error and does not generate a questionnaire", async () => {
    outputs.push({ fields: [] });
    const result = await post("/api/analyze-feedback", { rawText: "今天学习数学" });
    assert.equal(result.status, 500);
    assert.match(result.body.error, /不完整/);
    assert.equal(result.body.questions, undefined);
    const before = prompts.length;
    assert.equal((await post("/api/analyze-feedback", { rawText: " " })).status, 400);
    assert.equal(prompts.length, before);
  });
});
