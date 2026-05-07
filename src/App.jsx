import { useEffect, useMemo, useState } from "react";

const FEEDBACK_API_URL = import.meta.env.VITE_API_URL || "/api/generate-feedback";
const STUDENTS_API_URL = "/api/students";
const CLASS_TIME_OPTIONS = [
  "8:00-10:00",
  "10:10-12:10",
  "13:10-15:10",
  "14:00-16:00",
  "16:00-18:00",
  "15:10-17:10",
  "17:10-19:10",
  "19:30-21:30",
  "19:00-21:00",
];

const emptyResult = {
  studentName: "",
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

const fields = [
  ["studentName", "学生姓名"],
  ["courseName", "课程名称"],
  ["todayContent", "今日教学内容"],
  ["keyPoints", "本节课重点"],
  ["difficultPoints", "本节课难点"],
  ["absorption", "学生吸收情况"],
  ["classroomPerformance", "课堂表现"],
  ["homework", "作业布置"],
  ["nextSuggestion", "后续建议"],
  ["parentFeedback", "家长反馈话术"],
];

function getTodayLabel() {
  const today = new Date();
  return `${today.getMonth() + 1}月${today.getDate()}日`;
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(value) {
  if (!value) return getTodayLabel();

  const [, month, day] = value.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br />");
}

function estimateRowHeight(text, minHeight, charsPerLine, lineHeight) {
  const plain = String(text || "");
  const explicitLines = plain.split("\n");
  const lineCount = explicitLines.reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);

  return Math.max(minHeight, lineCount * lineHeight + 42);
}

function safeFilePart(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "");

  return cleaned || fallback;
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text);
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${fallbackMessage}：接口返回了网页而不是 JSON，请确认当前部署包含后端 API。`);
  }
}

function buildTemplateExcel(result, meta) {
  const content = escapeHtml(result.todayContent);
  const keyPoints = escapeHtml(result.keyPoints);
  const difficultPoints = escapeHtml(result.difficultPoints);
  const absorption = escapeHtml(result.absorption);
  const homework = escapeHtml(result.homework);
  const studentName = escapeHtml(result.studentName || "同学");
  const teacherName = escapeHtml(meta.teacherName || "蔡沁沛");
  const lessonTitle = escapeHtml(`第${meta.lessonNumber || 1}次课`);
  const classDate = escapeHtml(formatDateLabel(meta.classDate));
  const classTime = escapeHtml(meta.classTime || "10:10-12:10");
  const attendance = escapeHtml(meta.attendance || "√");
  const homeworkStatus = escapeHtml(meta.homeworkStatus || "已完成");
  const seriousness = escapeHtml("★".repeat(Number(meta.seriousness) || 4));
  const interaction = escapeHtml("★".repeat(Number(meta.interaction) || 3));
  const contentHeight = estimateRowHeight(result.todayContent, 220, 46, 32);
  const absorptionHeight = estimateRowHeight(result.absorption, 220, 30, 32);
  const keyDifficultHeight = estimateRowHeight(
    `${result.keyPoints}\n\n${result.difficultPoints}`,
    520,
    46,
    32,
  );
  const homeworkHeight = estimateRowHeight(result.homework, 260, 28, 32);
  const bottomHeight = Math.max(keyDifficultHeight, homeworkHeight);

  return `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8" />
  <!--[if gte mso 9]>
  <xml>
    <x:ExcelWorkbook>
      <x:ExcelWorksheets>
        <x:ExcelWorksheet>
          <x:Name>课堂反馈</x:Name>
          <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
        </x:ExcelWorksheet>
      </x:ExcelWorksheets>
    </x:ExcelWorkbook>
  </xml>
  <![endif]-->
  <style>
    table { border-collapse: collapse; table-layout: fixed; }
    td { border: 1px solid #000; font-family: "SimSun", "Microsoft YaHei", Arial, sans-serif; font-size: 16pt; vertical-align: middle; padding: 4px; }
    .top { height: 62px; text-align: center; font-size: 22pt; font-weight: 700; color: #ff0000; white-space: nowrap; }
    .label { height: 46px; text-align: center; font-size: 12pt; font-weight: 700; white-space: nowrap; }
    .smallCenter { text-align: center; font-size: 14pt; }
    .orange { background: #f4b183; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .blue { background: #8eaadb; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .green { background: #a9d18e; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .cyan { background: #c9f1ef; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .text { vertical-align: top; line-height: 1.45; font-size: 15pt; padding: 10px 8px; white-space: normal; mso-wrap-style: square; mso-data-placement: same-cell; }
    .homeworkBox { text-align: center; font-size: 16pt; border: 2px solid #107c41; }
  </style>
</head>
<body>
  <table width="1660">
    <col width="125" /><col width="125" /><col width="165" /><col width="240" />
    <col width="125" /><col width="175" /><col width="150" /><col width="205" />
    <col width="205" /><col width="205" /><col width="205" />
    <tr>
      <td class="top" colspan="3">${lessonTitle}</td>
      <td class="top" colspan="4">【上课时间】${classDate}&nbsp;&nbsp;${classTime}</td>
      <td class="top" colspan="4">【任课老师】${teacherName}</td>
    </tr>
    <tr>
      <td class="label">学员姓名</td>
      <td class="label">出席情况</td>
      <td class="label" colspan="3">课堂表现点评</td>
      <td class="label">/</td>
      <td class="label">作业完成情况</td>
      <td class="green" colspan="4">三、学生吸收情况</td>
    </tr>
    <tr>
      <td class="smallCenter">${studentName}</td>
      <td class="smallCenter">${attendance}</td>
      <td class="smallCenter" colspan="3">认真程度：${seriousness}&nbsp;&nbsp;&nbsp;&nbsp;互动性：${interaction}</td>
      <td></td>
      <td class="smallCenter">${homeworkStatus}</td>
      <td class="text" colspan="4" rowspan="3" style="height:${absorptionHeight}px">${absorption}</td>
    </tr>
    <tr>
      <td class="orange" colspan="7">一、本节课教学内容</td>
    </tr>
    <tr height="${contentHeight}">
      <td class="text" colspan="7">${content}</td>
    </tr>
    <tr>
      <td class="blue" colspan="7">二、本节课重难点</td>
      <td class="cyan" colspan="4">四、作业布置</td>
    </tr>
    <tr height="${bottomHeight}">
      <td class="text" colspan="7">一、知识重点<br />${keyPoints}<br /><br />二、核心难点<br />${difficultPoints}</td>
      <td class="homeworkBox" colspan="4">${homework}</td>
    </tr>
  </table>
</body>
</html>`;
}

export default function App() {
  const [rawText, setRawText] = useState("");
  const [style, setStyle] = useState("温和鼓励");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studentError, setStudentError] = useState("");
  const [copied, setCopied] = useState("");
  const [students, setStudents] = useState([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [result, setResult] = useState(emptyResult);
  const [meta, setMeta] = useState({
    lessonNumber: "3",
    classDate: getTodayInputValue(),
    classTime: "10:10-12:10",
    classTimeMode: "10:10-12:10",
    teacherName: "蔡沁沛",
    attendance: "√",
    seriousness: 4,
    interaction: 3,
    homeworkStatus: "已完成",
  });

  const hasResult = Boolean(result.parentFeedback);

  const excelText = useMemo(() => {
    if (!hasResult) return "";

    const header = fields.map(([, label]) => label);
    const row = fields.map(([key]) => String(result[key] || "").replace(/\n/g, " "));
    return `${header.join("\t")}\n${row.join("\t")}`;
  }, [hasResult, result]);

  useEffect(() => {
    loadStudents();
  }, []);

  async function loadStudents() {
    try {
      const response = await fetch(STUDENTS_API_URL);
      const data = await readJsonResponse(response, "读取学生名单失败");

      if (!response.ok) {
        throw new Error(data.error || "读取学生名单失败");
      }

      setStudents(data.students || []);
    } catch (err) {
      setStudentError(err.message || "读取学生名单失败");
    }
  }

  async function addStudent() {
    const name = newStudentName.trim();

    if (!name) {
      setStudentError("请输入学生姓名。");
      return;
    }

    try {
      setStudentError("");
      const response = await fetch(STUDENTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await readJsonResponse(response, "保存学生姓名失败");

      if (!response.ok) {
        throw new Error(data.error || "保存学生姓名失败");
      }

      setStudents(data.students || []);
      setNewStudentName("");
      updateResult("studentName", name);
    } catch (err) {
      setStudentError(err.message || "保存学生姓名失败");
    }
  }

  async function deleteStudent() {
    if (!result.studentName) {
      setStudentError("请先选择要删除的学生。");
      return;
    }

    try {
      setStudentError("");
      const response = await fetch(`${STUDENTS_API_URL}/${encodeURIComponent(result.studentName)}`, {
        method: "DELETE",
      });
      const data = await readJsonResponse(response, "删除学生姓名失败");

      if (!response.ok) {
        throw new Error(data.error || "删除学生姓名失败");
      }

      setStudents(data.students || []);
      updateResult("studentName", "");
    } catch (err) {
      setStudentError(err.message || "删除学生姓名失败");
    }
  }

  function updateResult(key, value) {
    setResult((prev) => ({ ...prev, [key]: value }));
  }

  function updateMeta(key, value) {
    setMeta((prev) => ({ ...prev, [key]: value }));
  }

  async function generateFeedback() {
    if (!rawText.trim()) {
      setError("请先输入一段课堂记录。比如：小明今天上初二数学，讲了一次函数图像...");
      return;
    }

    setLoading(true);
    setError("");
    setCopied("");

    try {
      const response = await fetch(FEEDBACK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, style }),
      });

      const data = await readJsonResponse(response, "AI 生成失败");

      if (!response.ok) {
        throw new Error(data.error || "AI 生成失败");
      }

      setResult((prev) => ({
        ...emptyResult,
        ...data,
        studentName: prev.studentName || data.studentName || "",
      }));
    } catch (err) {
      setError(err.message || "请求失败。请确认 server.js 已经运行。");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(type, text) {
    copyText(text);
    setCopied(type);
    setTimeout(() => setCopied(""), 1600);
  }

  function downloadExcel() {
    if (!hasResult) return;

    const html = buildTemplateExcel(result, meta);
    const studentName = safeFilePart(result.studentName, "学生");
    const courseName = safeFilePart(result.courseName, "课程");
    const lessonName = safeFilePart(`第${meta.lessonNumber || 1}次课`, "课次");
    const blob = new Blob(["\ufeff", html], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${studentName}-${courseName}-${lessonName}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <style>{css}</style>

      <header className="hero">
        <div className="tag">AI 课堂反馈生成器</div>
        <h1>输入课堂记录，自动整理成可编辑的课后反馈表</h1>
        <p>
          适合教培老师课后快速整理：教学内容、重点难点、学生吸收情况、作业布置和家长反馈话术。生成后可以直接下载成接近模板样式的 Excel。
        </p>
      </header>

      <main className="layout">
        <section className="card">
          <div className="cardTitleRow">
            <h2>1. 输入课堂记录</h2>
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              <option>温和鼓励</option>
              <option>专业正式</option>
              <option>亲切口语</option>
              <option>简短直接</option>
            </select>
          </div>

          <textarea
            className="bigInput"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="例如：小明今天上初二数学，讲了一次函数图像和性质。重点是理解 k 和 b 对图像的影响，还练了根据图像判断函数表达式。基础题能做出来，但遇到图像和实际问题结合时反应比较慢，容易看错坐标。课堂上能跟着老师思路走，但主动表达少了一点。作业是完成讲义第 3 到 8 题，把错题订正一遍。"
          />

          {error && <div className="errorBox">{error}</div>}

          <button className="primaryBtn" onClick={generateFeedback} disabled={loading}>
            {loading ? "AI 正在生成中..." : "生成分类结果和反馈话术"}
          </button>
        </section>

        <section className="card">
          <div className="cardTitleRow">
            <h2>2. 基础信息</h2>
            <button className="smallBtn dark" disabled={!hasResult} onClick={downloadExcel}>
              下载模板 Excel
            </button>
          </div>

          <div className="studentManager">
            <label className="textInput">
              <span>学员姓名</span>
              <select value={result.studentName} onChange={(e) => updateResult("studentName", e.target.value)}>
                <option value="">选择学生</option>
                {students.map((student) => (
                  <option key={student} value={student}>
                    {student}
                  </option>
                ))}
              </select>
            </label>
            <div className="inlineActions">
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="新增学生姓名"
              />
              <button className="smallBtn" type="button" onClick={addStudent}>
                添加
              </button>
              <button className="smallBtn danger" type="button" disabled={!result.studentName} onClick={deleteStudent}>
                删除所选
              </button>
            </div>
            {studentError && <div className="miniError">{studentError}</div>}
          </div>

          <div className="metaGrid">
            <TextInput
              label="课次"
              note="填写阿拉伯数字，例如：1、2、3"
              type="number"
              min="1"
              value={meta.lessonNumber}
              onChange={(v) => updateMeta("lessonNumber", v)}
              prefix="第"
              suffix="次课"
            />
            <TextInput label="日期" type="date" value={meta.classDate} onChange={(v) => updateMeta("classDate", v)} />
            <ClassTimeInput meta={meta} updateMeta={updateMeta} />
            <SelectInput
              label="任课老师"
              value={meta.teacherName}
              options={["蔡沁沛", "陈思桦"]}
              onChange={(v) => updateMeta("teacherName", v)}
            />
            <SegmentedInput
              label="出席情况"
              value={meta.attendance}
              options={[
                ["√", "√"],
                ["×", "×"],
              ]}
              onChange={(v) => updateMeta("attendance", v)}
            />
            <SegmentedInput
              label="作业完成"
              value={meta.homeworkStatus}
              options={[
                ["已完成", "已完成"],
                ["未完成", "未完成"],
              ]}
              onChange={(v) => updateMeta("homeworkStatus", v)}
            />
            <RatingInput label="认真程度" value={meta.seriousness} onChange={(v) => updateMeta("seriousness", v)} />
            <RatingInput label="互动性" value={meta.interaction} onChange={(v) => updateMeta("interaction", v)} />
          </div>

          <div className="buttonGroup">
            <button
              className="smallBtn"
              disabled={!hasResult}
              onClick={() => handleCopy("feedback", result.parentFeedback)}
            >
              {copied === "feedback" ? "已复制" : "复制家长话术"}
            </button>
            <button
              className="smallBtn"
              disabled={!hasResult}
              onClick={() => handleCopy("excel", excelText)}
            >
              {copied === "excel" ? "已复制" : "复制普通表格"}
            </button>
          </div>
        </section>
      </main>

      <section className="card fullCard">
        <h2>3. AI 自动分类结果</h2>
        <p className="hint">下面内容可以手动修改。修改后，下载模板 Excel 时会使用你修改后的内容。</p>

        <div className="grid">
          {fields.slice(1, -1).map(([key, label]) => (
            <EditableItem
              key={key}
              label={label}
              value={result[key]}
              onChange={(value) => updateResult(key, value)}
              large
            />
          ))}
        </div>

        <h3>家长反馈话术</h3>
        <textarea
          className="feedbackBox compact"
          value={
            hasResult
              ? result.parentFeedback
              : "生成后，这里会出现可以直接发给家长的反馈话术。你也可以在这里手动修改后再复制。"
          }
          onChange={(e) => updateResult("parentFeedback", e.target.value)}
          readOnly={!hasResult}
        />
      </section>
    </div>
  );
}

function TextInput({ label, note, value, onChange, prefix, suffix, ...props }) {
  return (
    <label className="textInput">
      <span>
        {label}
        {note && <em>{note}</em>}
      </span>
      {prefix || suffix ? (
        <div className="affixInput">
          {prefix && <b>{prefix}</b>}
          <input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
          {suffix && <b>{suffix}</b>}
        </div>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} {...props} />
      )}
    </label>
  );
}

function SelectInput({ label, value, options, onChange }) {
  return (
    <label className="textInput">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ClassTimeInput({ meta, updateMeta }) {
  return (
    <div className="textInput">
      <span>时间</span>
      <select
        value={meta.classTimeMode}
        onChange={(e) => {
          const value = e.target.value;
          updateMeta("classTimeMode", value);
          updateMeta("classTime", value === "其他" ? "" : value);
        }}
      >
        {CLASS_TIME_OPTIONS.map((time) => (
          <option key={time}>{time}</option>
        ))}
        <option>其他</option>
      </select>
      {meta.classTimeMode === "其他" && (
        <input
          className="otherTimeInput"
          value={meta.classTime}
          onChange={(e) => updateMeta("classTime", e.target.value)}
          placeholder="填写其他时间，例如 9:00-11:00"
        />
      )}
    </div>
  );
}

function SegmentedInput({ label, value, options, onChange }) {
  return (
    <div className="textInput">
      <span>{label}</span>
      <div className="segmented">
        {options.map(([optionValue, labelText]) => (
          <button
            key={optionValue}
            type="button"
            className={value === optionValue ? "selected" : ""}
            onClick={() => onChange(optionValue)}
          >
            {labelText}
          </button>
        ))}
      </div>
    </div>
  );
}

function RatingInput({ label, value, onChange }) {
  const score = Number(value) || 0;

  return (
    <div className="textInput">
      <span>{label}</span>
      <div className="rating" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            className={rating <= score ? "active" : ""}
            aria-label={`${rating}分`}
            aria-checked={rating === score}
            role="radio"
            onClick={() => onChange(rating)}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function EditableItem({ label, value, onChange, large }) {
  return (
    <div className={large ? "item large" : "item"}>
      <label>{label}</label>
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="等待 AI 生成" />
    </div>
  );
}

const css = `
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
  background: #f4f6f8;
  color: #172033;
}

button,
input,
textarea,
select {
  font-family: inherit;
}

.page {
  min-height: 100vh;
  padding: 28px;
}

.hero,
.card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.hero {
  max-width: 1180px;
  margin: 0 auto 22px;
  padding: 28px;
}

.tag {
  display: inline-block;
  padding: 7px 12px;
  border-radius: 999px;
  background: #eef2ff;
  color: #334155;
  font-size: 14px;
  margin-bottom: 12px;
}

.hero h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.25;
}

.hero p {
  max-width: 900px;
  margin: 12px 0 0;
  line-height: 1.8;
  color: #64748b;
}

.layout {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}

.card {
  padding: 22px;
}

.fullCard {
  max-width: 1180px;
  margin: 22px auto 0;
}

.cardTitleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 20px;
}

h3 {
  margin: 22px 0 10px;
  font-size: 17px;
}

input,
select {
  border: 1px solid #d8dee9;
  border-radius: 6px;
  padding: 10px 12px;
  background: #ffffff;
  outline: none;
}

textarea {
  width: 100%;
  border: 1px solid #d8dee9;
  border-radius: 6px;
  padding: 14px;
  outline: none;
  resize: vertical;
  line-height: 1.7;
  font-size: 14px;
  background: #f8fafc;
}

input:focus,
textarea:focus {
  border-color: #64748b;
  background: #ffffff;
}

.bigInput {
  min-height: 360px;
}

.feedbackBox {
  min-height: 270px;
}

.feedbackBox.compact {
  min-height: 220px;
}

.primaryBtn {
  margin-top: 14px;
  width: 100%;
  border: none;
  border-radius: 6px;
  padding: 14px 16px;
  background: #111827;
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.primaryBtn:hover {
  background: #334155;
}

.primaryBtn:disabled,
.smallBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.smallBtn {
  border: 1px solid #d8dee9;
  border-radius: 6px;
  padding: 10px 14px;
  background: #ffffff;
  color: #172033;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.smallBtn:hover {
  background: #f8fafc;
}

.smallBtn.dark {
  background: #111827;
  color: #ffffff;
  border-color: #111827;
}

.smallBtn.danger {
  color: #b91c1c;
  border-color: #fecaca;
}

.buttonGroup,
.inlineActions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.inlineActions input {
  flex: 1 1 160px;
}

.errorBox,
.miniError {
  margin-top: 12px;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 6px;
  padding: 12px;
  font-size: 14px;
}

.miniError {
  padding: 9px 10px;
}

.hint {
  margin: 8px 0 18px;
  color: #64748b;
  font-size: 14px;
}

.studentManager {
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid #e5e7eb;
}

.grid,
.metaGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.textInput span,
.item label {
  display: block;
  margin-bottom: 7px;
  color: #475569;
  font-size: 13px;
  font-weight: 700;
}

.textInput em {
  display: block;
  margin-top: 3px;
  color: #94a3b8;
  font-style: normal;
  font-weight: 500;
}

.textInput input,
.textInput select {
  width: 100%;
}

.otherTimeInput {
  margin-top: 8px;
}

.affixInput {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  border: 1px solid #d8dee9;
  border-radius: 6px;
  background: #ffffff;
  padding: 0 12px;
}

.affixInput:focus-within {
  border-color: #64748b;
}

.affixInput input {
  border: 0;
  padding-left: 0;
  padding-right: 0;
  text-align: center;
}

.affixInput input:focus {
  border-color: transparent;
}

.affixInput b {
  color: #172033;
  font-size: 14px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.segmented button {
  border: 1px solid #d8dee9;
  border-radius: 6px;
  padding: 10px 12px;
  background: #ffffff;
  color: #172033;
  font-weight: 700;
  cursor: pointer;
}

.segmented button.selected {
  border-color: #111827;
  background: #111827;
  color: #ffffff;
}

.rating {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  border: 1px solid #d8dee9;
  border-radius: 6px;
  background: #ffffff;
  padding: 7px;
}

.rating button {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
  padding: 7px 0;
}

.rating button.active {
  color: #111827;
}

.rating button:hover {
  background: #f8fafc;
}

.item textarea {
  min-height: 96px;
}

.item.large textarea {
  min-height: 190px;
}

@media (max-width: 900px) {
  .page {
    padding: 14px;
  }

  .layout,
  .grid,
  .metaGrid {
    grid-template-columns: 1fr;
  }

  .cardTitleRow {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero h1 {
    font-size: 26px;
  }
}
`;
