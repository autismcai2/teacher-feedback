import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFeedbackSupplement } from "../feedback-policy.js";

test("skipped details permit curriculum based drafts while protecting explicit facts", () => {
  const prompt = buildFeedbackSupplement();
  assert.match(prompt, /默认出席学生已经参与相关基础练习/);
  assert.match(prompt, /明确写了未做题、未完成作业、不布置作业、请假或缺席时必须尊重事实/);
  assert.match(prompt, /不要编造具体分数、题号、排名/);
  assert.match(prompt, /不要输出“没有做题情况”/);
});

test("teacher supplements retain explicit negative facts instead of becoming skipped details", () => {
  const prompt = buildFeedbackSupplement({ practice: " 本节没有练习 ", mastery: "基础不牢", homework: "不布置作业" });
  assert.match(prompt, /课堂练习：本节没有练习/);
  assert.match(prompt, /答题与掌握情况：基础不牢/);
  assert.match(prompt, /作业布置：不布置作业/);
  assert.doesNotMatch(prompt, /课堂练习：已跳过/);
  assert.doesNotMatch(prompt, /作业布置：已跳过/);
  assert.doesNotThrow(() => buildFeedbackSupplement(null));
});
