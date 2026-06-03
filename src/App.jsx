import { useEffect, useMemo, useState } from "react";
import { Copy, Download, Plus, Sparkles, Trash2 } from "lucide-react";

const FEEDBACK_API_URL = import.meta.env.VITE_API_URL || "/api/generate-feedback";
const STUDENTS_API_URL = "/api/students";
const DEFAULT_TEACHER_NAME = "陈思桦";
const TEACHER_OPTIONS = ["陈思桦", "蔡沁沛"];
const STUDENT_LESSON_STORAGE_KEY = "teacher-feedback.teacher-student-lessons.v1";
const LEGACY_STUDENT_LESSON_STORAGE_KEY = "teacher-feedback.student-lessons.v1";
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

function toLessonNumber(value, fallback = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  const normalized = Math.floor(number);
  return normalized >= 1 ? normalized : fallback;
}

function normalizeStudentLessonValue(value) {
  if (value && typeof value === "object") {
    return toLessonNumber(value.lastLessonNumber, 0);
  }

  return toLessonNumber(value, 0);
}

function normalizeStudentLessonMap(lessons) {
  if (!lessons || typeof lessons !== "object") return {};

  return Object.fromEntries(
    Object.entries(lessons)
      .map(([name, value]) => [name, normalizeStudentLessonValue(value)])
      .filter(([name, lessonNumber]) => name && lessonNumber > 0),
  );
}

function readStudentLessonStore() {
  if (typeof window === "undefined") return {};

  try {
    const stored = JSON.parse(window.localStorage.getItem(STUDENT_LESSON_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function mergeStudentLessonMaps(...lessonMaps) {
  return lessonMaps.reduce((merged, lessonMap) => {
    const normalized = normalizeStudentLessonMap(lessonMap);

    for (const [name, lessonNumber] of Object.entries(normalized)) {
      merged[name] = Math.max(merged[name] || 0, lessonNumber);
    }

    return merged;
  }, {});
}

function readStoredStudentLessons(teacherName = DEFAULT_TEACHER_NAME) {
  if (typeof window === "undefined") return {};

  const store = readStudentLessonStore();
  const teacherLessons = normalizeStudentLessonMap(store[teacherName]);

  if (teacherName !== DEFAULT_TEACHER_NAME) {
    return teacherLessons;
  }

  try {
    const legacyLessons = normalizeStudentLessonMap(
      JSON.parse(window.localStorage.getItem(LEGACY_STUDENT_LESSON_STORAGE_KEY) || "{}"),
    );
    return mergeStudentLessonMaps(legacyLessons, teacherLessons);
  } catch {
    return teacherLessons;
  }
}

function writeStoredStudentLessons(teacherName, lessons) {
  if (typeof window === "undefined") return;

  try {
    const store = readStudentLessonStore();
    const nextStore = {
      ...store,
      [teacherName]: normalizeStudentLessonMap(lessons),
    };
    window.localStorage.setItem(STUDENT_LESSON_STORAGE_KEY, JSON.stringify(nextStore));
  } catch {
    // 浏览器禁用本地存储时，后端同步仍然可以保存课次。
  }
}

function nextLessonNumberForStudent(studentLessons, studentName) {
  const lastLessonNumber = normalizeStudentLessonValue((studentLessons || {})[studentName]);
  return String(lastLessonNumber > 0 ? lastLessonNumber + 1 : 1);
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
  const keyPoints = escapeHtml(String(result.keyPoints || "").trim());
  const difficultPoints = escapeHtml(String(result.difficultPoints || "").trim());
  const absorption = escapeHtml(result.absorption);
  const homework = escapeHtml(result.homework);
  const studentName = escapeHtml(result.studentName || "同学");
  const teacherName = escapeHtml(meta.teacherName || DEFAULT_TEACHER_NAME);
  const lessonTitle = escapeHtml(`第${meta.lessonNumber || 1}次课`);
  const classDate = escapeHtml(formatDateLabel(meta.classDate));
  const classTime = escapeHtml(meta.classTime || "10:10-12:10");
  const attendance = escapeHtml(meta.attendance || "√");
  const homeworkStatus = escapeHtml(meta.homeworkStatus || "已完成");
  const seriousness = escapeHtml("★".repeat(Number(meta.seriousness) || 4));
  const interaction = escapeHtml("★".repeat(Number(meta.interaction) || 3));
  const contentHeight = estimateRowHeight(result.todayContent, 220, 40, 32);
  const absorptionHeight = estimateRowHeight(result.absorption, 220, 30, 32);
  const subTitleHeight = 46;
  const keyPointsHeight = estimateRowHeight(result.keyPoints, 320, 40, 32);
  const difficultPointsHeight = estimateRowHeight(result.difficultPoints, 320, 40, 32);
  const homeworkHeight = estimateRowHeight(result.homework, 260, 28, 32);
  const keyDifficultHeight = keyPointsHeight + difficultPointsHeight + subTitleHeight * 2;
  const extraBottomHeight = Math.max(0, homeworkHeight - keyDifficultHeight);
  const finalKeyPointsHeight = keyPointsHeight + Math.ceil(extraBottomHeight / 2);
  const finalDifficultPointsHeight = difficultPointsHeight + Math.floor(extraBottomHeight / 2);

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
    body, table, td { font-family: "宋体", SimSun, serif; mso-font-charset: 134; mso-fareast-font-family: "宋体"; }
    table { border-collapse: collapse; table-layout: fixed; }
    td { border: 1px solid #000; font-size: 16pt; vertical-align: middle; padding: 4px; }
    .top { height: 62px; text-align: center; font-size: 22pt; font-weight: 700; color: #ff0000; white-space: nowrap; }
    .label { height: 46px; text-align: center; font-size: 12pt; font-weight: 700; white-space: nowrap; }
    .smallCenter { text-align: center; font-size: 14pt; }
    .orange { background: #f4b183; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .blue { background: #8eaadb; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .green { background: #a9d18e; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .cyan { background: #c9f1ef; text-align: center; height: 46px; font-size: 22pt; font-weight: 700; }
    .text { vertical-align: top; line-height: 1.45; font-size: 15pt; padding: 10px 8px; white-space: normal; mso-wrap-style: square; mso-data-placement: same-cell; }
    .subTitle { vertical-align: middle; text-align: left; font-weight: 700; background: #f7f9fc; }
    .homeworkBox { text-align: center; font-size: 16pt; border: 2px solid #107c41; }
  </style>
</head>
<body>
  <table width="1750">
    <col width="125" /><col width="125" /><col width="165" /><col width="240" />
    <col width="125" /><col width="150" /><col width="205" />
    <col width="205" /><col width="205" /><col width="205" />
    <tr>
      <td class="top" colspan="3">${lessonTitle}</td>
      <td class="top" colspan="3">【上课时间】${classDate}&nbsp;&nbsp;${classTime}</td>
      <td class="top" colspan="4">【任课老师】${teacherName}</td>
    </tr>
    <tr>
      <td class="label">学员姓名</td>
      <td class="label">出席情况</td>
      <td class="label" colspan="3">课堂表现点评</td>
      <td class="label">作业完成情况</td>
      <td class="green" colspan="4">三、学生吸收情况</td>
    </tr>
    <tr>
      <td class="smallCenter">${studentName}</td>
      <td class="smallCenter">${attendance}</td>
      <td class="smallCenter" colspan="3">认真程度：${seriousness}&nbsp;&nbsp;&nbsp;&nbsp;互动性：${interaction}</td>
      <td class="smallCenter">${homeworkStatus}</td>
      <td class="text" colspan="4" rowspan="3" style="height:${absorptionHeight}px">${absorption}</td>
    </tr>
    <tr>
      <td class="orange" colspan="6">一、本节课教学内容</td>
    </tr>
    <tr height="${contentHeight}">
      <td class="text" colspan="6">${content}</td>
    </tr>
    <tr>
      <td class="blue" colspan="6">二、本节课重难点</td>
      <td class="cyan" colspan="4">四、作业布置</td>
    </tr>
    <tr height="${subTitleHeight}">
      <td class="text subTitle" colspan="6">一、知识重点</td>
      <td class="homeworkBox" colspan="4" rowspan="4">${homework}</td>
    </tr>
    <tr height="${finalKeyPointsHeight}">
      <td class="text" colspan="6">${keyPoints}</td>
    </tr>
    <tr height="${subTitleHeight}">
      <td class="text subTitle" colspan="6">二、核心难点</td>
    </tr>
    <tr height="${finalDifficultPointsHeight}">
      <td class="text" colspan="6">${difficultPoints}</td>
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
  const [studentLessons, setStudentLessons] = useState(() => readStoredStudentLessons(DEFAULT_TEACHER_NAME));
  const [newStudentName, setNewStudentName] = useState("");
  const [result, setResult] = useState(emptyResult);
  const [meta, setMeta] = useState({
    lessonNumber: "1",
    classDate: getTodayInputValue(),
    classTime: "10:10-12:10",
    classTimeMode: "10:10-12:10",
    teacherName: DEFAULT_TEACHER_NAME,
    attendance: "√",
    seriousness: 4,
    interaction: 3,
    homeworkStatus: "已完成",
  });

  const hasResult = Boolean(result.parentFeedback);
  const selectedStudentLastLesson = result.studentName ? studentLessons[result.studentName] || 0 : 0;
  const currentLessonNumber = toLessonNumber(meta.lessonNumber);

  const excelText = useMemo(() => {
    if (!hasResult) return "";

    const header = fields.map(([, label]) => label);
    const row = fields.map(([key]) => String(result[key] || "").replace(/\n/g, " "));
    return `${header.join("\t")}\n${row.join("\t")}`;
  }, [hasResult, result]);

  useEffect(() => {
    async function loadStudents() {
      const teacherName = meta.teacherName;

      try {
        const response = await fetch(`${STUDENTS_API_URL}?teacherName=${encodeURIComponent(teacherName)}`);
        const data = await readJsonResponse(response, "读取学生名单失败");

        if (!response.ok) {
          throw new Error(data.error || "读取学生名单失败");
        }

        const nextStudents = data.students || [];
        const nextLessons = mergeStudentLessonMaps(readStoredStudentLessons(teacherName), data.studentLessons);

        setStudents(nextStudents);
        setStudentLessons(nextLessons);
        writeStoredStudentLessons(teacherName, nextLessons);

        setResult((prev) => {
          if (!prev.studentName || nextStudents.includes(prev.studentName)) return prev;
          return { ...prev, studentName: "" };
        });
      } catch (err) {
        setStudentError(err.message || "读取学生名单失败");
      }
    }

    loadStudents();
  }, [meta.teacherName]);

  function syncStudentLessons(serverLessons, deletedStudentName = "", teacherName = meta.teacherName) {
    const nextLessons = mergeStudentLessonMaps(readStoredStudentLessons(teacherName), serverLessons);

    if (deletedStudentName) {
      delete nextLessons[deletedStudentName];
    }

    setStudentLessons(nextLessons);
    writeStoredStudentLessons(teacherName, nextLessons);
    return nextLessons;
  }

  function selectTeacher(teacherName) {
    updateMeta("teacherName", teacherName);
    updateMeta("lessonNumber", "1");
    updateResult("studentName", "");
    setStudents([]);
    setStudentLessons(readStoredStudentLessons(teacherName));
    setStudentError("");
  }

  function selectStudent(name, lessons = studentLessons) {
    updateResult("studentName", name);

    if (name) {
      updateMeta("lessonNumber", nextLessonNumberForStudent(lessons, name));
    } else {
      updateMeta("lessonNumber", "1");
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
        body: JSON.stringify({ teacherName: meta.teacherName, name }),
      });
      const data = await readJsonResponse(response, "保存学生姓名失败");

      if (!response.ok) {
        throw new Error(data.error || "保存学生姓名失败");
      }

      setStudents(data.students || []);
      const nextLessons = syncStudentLessons(data.studentLessons, "", meta.teacherName);
      setNewStudentName("");
      selectStudent(name, nextLessons);
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
      const deletingStudentName = result.studentName;
      const response = await fetch(
        `${STUDENTS_API_URL}/${encodeURIComponent(result.studentName)}?teacherName=${encodeURIComponent(
          meta.teacherName,
        )}`,
        {
          method: "DELETE",
        },
      );
      const data = await readJsonResponse(response, "删除学生姓名失败");

      if (!response.ok) {
        throw new Error(data.error || "删除学生姓名失败");
      }

      setStudents(data.students || []);
      syncStudentLessons(data.studentLessons, deletingStudentName, meta.teacherName);
      updateResult("studentName", "");
      updateMeta("lessonNumber", "1");
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

      const nextStudentName = result.studentName || data.studentName || "";

      setResult((prev) => ({
        ...emptyResult,
        ...data,
        studentName: prev.studentName || data.studentName || "",
      }));

      if (!result.studentName && students.includes(nextStudentName)) {
        updateMeta("lessonNumber", nextLessonNumberForStudent(studentLessons, nextStudentName));
      }
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

    const teacherName = meta.teacherName;
    const lessonNumber = toLessonNumber(meta.lessonNumber);
    const downloadMeta = { ...meta, lessonNumber: String(lessonNumber) };
    const html = buildTemplateExcel(result, downloadMeta);
    const studentName = safeFilePart(result.studentName, "学生");
    const courseName = safeFilePart(result.courseName, "课程");
    const lessonName = safeFilePart(`第${lessonNumber}次课`, "课次");
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
    void rememberStudentLesson(teacherName, result.studentName, lessonNumber);
  }

  async function rememberStudentLesson(teacherName, studentName, lessonNumber) {
    const normalizedLessonNumber = toLessonNumber(lessonNumber);

    if (!studentName) return;

    const optimisticLessons = {
      ...studentLessons,
      [studentName]: normalizedLessonNumber,
    };

    setStudentLessons(optimisticLessons);
    writeStoredStudentLessons(teacherName, optimisticLessons);
    updateMeta("lessonNumber", String(normalizedLessonNumber + 1));

    try {
      const response = await fetch(`${STUDENTS_API_URL}/${encodeURIComponent(studentName)}/lesson`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherName, lessonNumber: normalizedLessonNumber }),
      });
      const data = await readJsonResponse(response, "保存学生课次失败");

      if (!response.ok) {
        throw new Error(data.error || "保存学生课次失败");
      }

      syncStudentLessons(data.studentLessons, "", teacherName);
    } catch (err) {
      console.warn("保存学生课次到后端失败，已保存在当前浏览器。", err);
    }
  }

  return (
    <div className="page">
      <style>{css}</style>

      <header className="hero">
        <div>
          <div className="tag">AI 课堂反馈生成器</div>
          <h1>课堂反馈工作台</h1>
          <p>输入课堂记录，生成可编辑的课后反馈和 Excel 模板。</p>
        </div>
        <div className="heroMeta" aria-label="当前基础信息">
          <span>{meta.teacherName}</span>
          <span>{result.studentName || "未选择学生"}</span>
          <span>第 {currentLessonNumber} 次课</span>
        </div>
      </header>

      <main className="layout">
        <section className="card">
          <div className="cardTitleRow">
            <h2>输入课堂记录</h2>
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
            <Sparkles size={18} aria-hidden="true" />
            {loading ? "AI 正在生成中..." : "生成分类结果和反馈话术"}
          </button>
        </section>

        <section className="card">
          <div className="cardTitleRow">
            <h2>基础信息</h2>
            <button className="smallBtn dark" disabled={!hasResult} onClick={downloadExcel}>
              <Download size={16} aria-hidden="true" />
              下载模板 Excel
            </button>
          </div>

          <div className="studentManager">
            <label className="textInput">
              <span>任课老师</span>
              <select value={meta.teacherName} onChange={(e) => selectTeacher(e.target.value)}>
                {TEACHER_OPTIONS.map((teacher) => (
                  <option key={teacher} value={teacher}>
                    {teacher}
                  </option>
                ))}
              </select>
            </label>
            <label className="textInput">
              <span>学员姓名</span>
              <select value={result.studentName} onChange={(e) => selectStudent(e.target.value)}>
                <option value="">选择{meta.teacherName}的学生</option>
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
                placeholder={`新增${meta.teacherName}的学生`}
              />
              <button className="smallBtn" type="button" onClick={addStudent}>
                <Plus size={16} aria-hidden="true" />
                添加
              </button>
              <button className="smallBtn danger" type="button" disabled={!result.studentName} onClick={deleteStudent}>
                <Trash2 size={16} aria-hidden="true" />
                删除所选
              </button>
            </div>
            {result.studentName && (
              <div className="lessonMemoryNote">
                {selectedStudentLastLesson > 0
                  ? `已记录 ${meta.teacherName} 的 ${result.studentName} 上次第 ${selectedStudentLastLesson} 次课；当前将下载第 ${currentLessonNumber} 次课。下载 Excel 后会更新记录。`
                  : `${meta.teacherName} 的 ${result.studentName} 还没有课次记录；当前将下载第 ${currentLessonNumber} 次课。下载 Excel 后会自动记住。`}
              </div>
            )}
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
              <Copy size={16} aria-hidden="true" />
              {copied === "feedback" ? "已复制" : "复制家长话术"}
            </button>
            <button
              className="smallBtn"
              disabled={!hasResult}
              onClick={() => handleCopy("excel", excelText)}
            >
              <Copy size={16} aria-hidden="true" />
              {copied === "excel" ? "已复制" : "复制普通表格"}
            </button>
          </div>
        </section>
      </main>

      <section className="card fullCard">
        <h2>AI 自动分类结果</h2>
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

:root {
  color-scheme: light;
  --ink: #172033;
  --muted: #667085;
  --line: #d9e1ea;
  --line-strong: #c8d2df;
  --surface: #ffffff;
  --surface-soft: #f7f9fb;
  --page: #edf2f7;
  --brand: #145c58;
  --brand-strong: #0f3f3d;
  --brand-soft: #e7f4f1;
  --warning: #8a5a00;
  --danger: #b42318;
  --danger-soft: #fff1f0;
  --shadow: 0 18px 45px rgba(27, 39, 61, 0.08);
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Arial, sans-serif;
  background:
    linear-gradient(180deg, #f8fbfc 0%, var(--page) 42%, #f5f7fa 100%);
  color: var(--ink);
}

button,
input,
textarea,
select {
  font-family: inherit;
}

.page {
  min-height: 100vh;
  padding: 22px;
}

.hero {
  max-width: 1320px;
  margin: 0 auto 16px;
  min-height: 96px;
  padding: 20px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
}

.tag {
  display: inline-block;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 12px;
  font-weight: 800;
  margin-bottom: 8px;
}

.hero h1 {
  margin: 0;
  font-size: 25px;
  line-height: 1.25;
  letter-spacing: 0;
}

.hero p {
  margin: 7px 0 0;
  line-height: 1.6;
  color: var(--muted);
  font-size: 14px;
}

.heroMeta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.heroMeta span {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-soft);
  padding: 8px 10px;
  color: #344054;
  font-size: 13px;
  font-weight: 700;
}

.layout {
  max-width: 1320px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(420px, 1.05fr) minmax(420px, 0.95fr);
  gap: 16px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: var(--shadow);
  padding: 20px;
}

.fullCard {
  max-width: 1320px;
  margin: 16px auto 0;
}

.cardTitleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0;
}

h3 {
  margin: 22px 0 10px;
  font-size: 16px;
}

input,
select {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--surface);
  color: var(--ink);
  outline: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 14px;
  outline: none;
  resize: vertical;
  line-height: 1.7;
  font-size: 14px;
  background: var(--surface-soft);
  color: var(--ink);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

input:focus,
select:focus,
textarea:focus {
  border-color: var(--brand);
  background: var(--surface);
  box-shadow: 0 0 0 3px rgba(20, 92, 88, 0.12);
}

.bigInput {
  min-height: 392px;
}

.feedbackBox {
  min-height: 270px;
}

.feedbackBox.compact {
  min-height: 210px;
}

.primaryBtn {
  margin-top: 14px;
  width: 100%;
  min-height: 46px;
  border: none;
  border-radius: 6px;
  padding: 14px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--brand);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
  box-shadow: 0 10px 20px rgba(20, 92, 88, 0.18);
}

.primaryBtn:hover {
  background: var(--brand-strong);
  transform: translateY(-1px);
}

.primaryBtn:disabled,
.smallBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.smallBtn {
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.smallBtn:hover {
  border-color: var(--line-strong);
  background: var(--surface-soft);
}

.smallBtn.dark {
  background: var(--ink);
  color: #ffffff;
  border-color: var(--ink);
}

.smallBtn.danger {
  color: var(--danger);
  border-color: #ffd1cc;
  background: #fffafa;
}

.smallBtn svg,
.primaryBtn svg {
  flex: 0 0 auto;
}

.buttonGroup,
.inlineActions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.inlineActions input {
  flex: 1 1 160px;
}

.errorBox,
.miniError {
  margin-top: 12px;
  background: var(--danger-soft);
  color: var(--danger);
  border-radius: 6px;
  padding: 12px;
  font-size: 14px;
  border: 1px solid #ffd1cc;
}

.miniError {
  padding: 9px 10px;
}

.lessonMemoryNote {
  margin-top: 12px;
  border-radius: 6px;
  background: var(--brand-soft);
  color: var(--brand-strong);
  font-size: 13px;
  line-height: 1.55;
  padding: 10px 12px;
  border: 1px solid #c8e8e0;
}

.hint {
  margin: 8px 0 18px;
  color: var(--muted);
  font-size: 14px;
}

.studentManager {
  margin-bottom: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.studentManager .inlineActions,
.studentManager .lessonMemoryNote,
.studentManager .miniError {
  grid-column: 1 / -1;
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
  color: #405166;
  font-size: 13px;
  font-weight: 700;
}

.textInput em {
  display: block;
  margin-top: 3px;
  color: #8a98aa;
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
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  padding: 0 12px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.affixInput:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px rgba(20, 92, 88, 0.12);
}

.affixInput input {
  border: 0;
  padding-left: 0;
  padding-right: 0;
  text-align: center;
}

.affixInput input:focus {
  border-color: transparent;
  box-shadow: none;
}

.affixInput b {
  color: var(--ink);
  font-size: 14px;
}

.segmented {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.segmented button {
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.segmented button.selected {
  border-color: var(--brand);
  background: var(--brand);
  color: #ffffff;
}

.rating {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  min-height: 42px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  padding: 7px;
}

.rating button {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #c3ccd8;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 7px 0;
}

.rating button.active {
  color: #b7791f;
}

.rating button:hover {
  background: #fff7ed;
}

.item textarea {
  min-height: 96px;
}

.item.large textarea {
  min-height: 170px;
}

.fullCard .grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 900px) {
  .page {
    padding: 14px;
  }

  .hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .heroMeta {
    justify-content: flex-start;
  }

  .layout,
  .grid,
  .metaGrid,
  .studentManager,
  .fullCard .grid {
    grid-template-columns: 1fr;
  }

  .cardTitleRow {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero h1 {
    font-size: 24px;
  }
}
`;
