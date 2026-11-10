import assert from "node:assert/strict";
import { test } from "node:test";
import { analysisKeys, buildAnalysisPrompt, normalizeAnalysis, generationInfo } from "../feedback-analysis.js";
import { downloadReviewMessage } from "../src/download-review.js";

function analysis(mode = "one-to-one", missing = []) {
  return normalizeAnalysis({ fields: analysisKeys(mode).map((key) => ({ key, status: missing.includes(key) ? "missing" : "provided", question: missing.includes(key) ? `请补充${key}` : "", evidence: "课堂记录" })) }, mode);
}

test("questions follow missing blocks including teaching content and key points, not fixed three steps", () => {
  const result = analysis("one-to-one", ["todayContent", "keyPoints", "homework"]);
  assert.deepEqual(result.questions.map((field) => field.key), ["todayContent", "keyPoints", "homework"]);
  assert.equal(result.questions[0].label, "今日教学内容");
  assert.equal(result.questions.some((field) => field.key === "practice"), false);
});

test("complete records have no questions; derived parent copy does not require a question", () => {
  const result = analysis();
  result.fields.find((field) => field.key === "parentFeedback").status = "inferred";
  assert.deepEqual(normalizeAnalysis(result).questions, []);
  assert.deepEqual(generationInfo(result, {}).autoCompletedFields, []);
});

test("download provenance distinguishes skipped, filled, and inferred fields", () => {
  const result = analysis("one-to-one", ["difficultPoints", "homework"]);
  result.fields.find((field) => field.key === "nextSuggestion").status = "inferred";
  const info = generationInfo(result, { homework: "本节不布置作业" });
  assert.deepEqual(info.autoCompletedFields.map((field) => field.key), ["difficultPoints", "nextSuggestion"]);
  const message = downloadReviewMessage(info);
  assert.match(message, /本节课难点、后续建议/);
  assert.doesNotMatch(message, /作业布置/);
  assert.match(downloadReviewMessage(generationInfo(analysis(), {})), /未发现需要额外模拟补全/);
  assert.doesNotMatch(downloadReviewMessage(null), /未发现/);
});

test("invalid analysis fails visibly rather than silently using a fixed questionnaire", () => {
  assert.throws(() => normalizeAnalysis({ fields: [] }), /不完整/);
  const result = analysis("group-class", ["homework"]);
  result.fields.find((field) => field.key === "homework").question = "";
  assert.throws(() => normalizeAnalysis(result, "group-class"), /缺少补充问题/);
  const duplicate = analysis();
  duplicate.fields.push(duplicate.fields[0]);
  assert.throws(() => normalizeAnalysis(duplicate), /不完整/);
});

test("analysis reads page values and warns against asking about exercises already described", () => {
  const prompt = buildAnalysisPrompt({ rawText: "数学 三角函数 做了随堂训练效果可以", meta: { studentName: "小李", seriousness: 4 }, supplementalDetails: { homework: "不布置作业" } });
  assert.match(prompt, /做了随堂训练，效果可以/);
  assert.match(prompt, /不固定问题数量/);
  assert.match(prompt, /小李/);
  assert.match(prompt, /不布置作业/);
  assert.match(prompt, /往次作业完成状态不代表本课布置的作业/);
});
