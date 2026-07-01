import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";

import { buildTemplateWorksheetModel, createTemplateExcelBuffer } from "../src/excel-template.js";

const result = {
  studentName: "陈美霖",
  courseName: "数学",
  todayContent: "今天继续讲解了排列组合的相关习题，重点放在相邻问题的捆绑法上。",
  keyPoints:
    "1. 排列组合中相邻问题的捆绑法：先把需要相邻的对象看成一个整体，再结合整体内部排列与外部排列分步计算；2. 独立性检验的核心表达。",
  difficultPoints: "本节课的难点主要在于把抽象概念转成具体步骤。",
  absorption: "从课堂表现看，孩子对排列组合的基础公式和计数方法掌握得比较熟练。",
  homework: "勾画的两题的思路消化和公式的再记忆。",
};

const meta = {
  lessonNumber: "3",
  classDate: "2026-06-14",
  classTime: "10:10-12:10",
  teacherName: "蔡沁沛",
  attendance: "√",
  homeworkStatus: "已完成",
  seriousness: 5,
  interaction: 5,
};

test("generated template is a real xlsx workbook", () => {
  const buffer = createTemplateExcelBuffer(result, meta);

  assert.equal(String.fromCharCode(buffer[0], buffer[1]), "PK");

  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets["课堂反馈"];

  assert.ok(sheet);
  assert.equal(sheet.A1.v, "第3次课");
  assert.equal(sheet.J2.v, "三、学生吸收情况");
  assert.equal(sheet.J7.v, result.homework);
});

test("generated template keeps expected merged layout", () => {
  const model = buildTemplateWorksheetModel(result, meta);

  assert.ok(model.merges.includes("J3:P5"));
  assert.ok(model.merges.includes("J7:P10"));
  assert.ok(model.merges.includes("A8:I8"));
  assert.equal(model.values.A6, "二、本节课重难点");
  assert.equal(model.values.A7, "一、知识重点");
});

test("generated template grows key-point row for long wrapped text", () => {
  const shortModel = buildTemplateWorksheetModel({ ...result, keyPoints: "短内容" }, meta);
  const longText = Array.from({ length: 10 }, () => result.keyPoints).join("");
  const longModel = buildTemplateWorksheetModel({ ...result, keyPoints: longText }, meta);

  assert.ok(longModel.rowHeights[8] > shortModel.rowHeights[8]);
});
