import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";

import { buildGroupClassWorksheetModel, buildTemplateWorksheetModel, createGroupClassExcelBuffer, createTemplateExcelBuffer } from "../src/excel-template.js";

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

test("group class template grows student rows and keeps four feedback sections", () => {
  const groupData = {
    classTitle: "2026年夏季班", grade: "初三", subject: "数学", classDate: "2026-07-13",
    classTime: "13:10-15:10", lessonNumber: 1, teachingContent: "一元二次方程的概念、配方法求解",
    difficultPoints: "二次三项式最值问题", absorption: "全班整体掌握良好", homework: "教材P9-P11",
    students: Array.from({ length: 6 }, (_, index) => ({ name: `学生${index + 1}`, attendance: "出席", quickNote: "课堂专注", score: 20 + index })),
  };
  const model = buildGroupClassWorksheetModel(groupData);
  assert.equal(model.values.A1, "2026年夏季班·初三数学·教学反馈");
  assert.equal(model.values.A9, "学生6");
  assert.equal(model.values.A10, "一、本节课教学内容");
  assert.equal(model.values.G12, "四、作业");
  assert.ok(model.merges.includes("G4:P11"));

  const workbook = XLSX.read(createGroupClassExcelBuffer(groupData), { type: "array" });
  const sheet = workbook.Sheets["课堂反馈"];
  assert.equal(sheet.E4.v, 20);
  assert.equal(sheet.G13.v, "教材P9-P11");
  assert.equal(workbook.Workbook.Names[0].Ref, "'课堂反馈'!$A$1:$P$13");
});
