import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Download, Plus, Sparkles, Trash2, X } from "lucide-react";
import { createTemplateExcelBlob } from "./excel-template";
import GroupClassWorkspace from "./GroupClassWorkspace";

const FEEDBACK_API_URL = import.meta.env.VITE_API_URL || "/api/generate-feedback";
const STUDENTS_API_URL = "/api/students";
const LESSONS_API_URL = "/api/lessons";
const DEFAULT_TEACHER_NAME = "陈思桦";
const TEACHER_OPTIONS = ["陈思桦", "蔡沁沛", "陈嘉仪"];
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

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function OneToOneWorkspace() {
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
        body: JSON.stringify({
          rawText,
          style,
          meta: { ...meta, studentName: result.studentName },
        }),
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

  async function downloadExcel() {
    if (!hasResult) return;

    const teacherName = meta.teacherName;
    const lessonNumber = toLessonNumber(meta.lessonNumber);
    const downloadMeta = { ...meta, lessonNumber: String(lessonNumber) };
    const studentName = safeFilePart(result.studentName, "学生");
    const courseName = safeFilePart(result.courseName, "课程");
    const lessonName = safeFilePart(`第${lessonNumber}次课`, "课次");
    const blob = createTemplateExcelBlob(result, downloadMeta);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${studentName}-${courseName}-${lessonName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    await saveLesson(downloadMeta);
    void rememberStudentLesson(teacherName, result.studentName, lessonNumber);
  }

  async function saveLesson(downloadMeta) {
    try {
      const response = await fetch(LESSONS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...downloadMeta,
          studentName: result.studentName,
          rawText,
          feedback: result,
        }),
      });
      const data = await readJsonResponse(response, "保存班课记录失败");
      if (!response.ok) throw new Error(data.error || "保存班课记录失败");
    } catch (err) {
      console.warn("Excel 已下载，但班课记录保存失败。", err);
      setError(`Excel 已下载，但班课记录保存失败：${err.message || "未知错误"}`);
    }
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

          {error && <div className="errorBox"><AlertCircle size={16} aria-hidden="true" /><span>{error}</span></div>}

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
            {studentError && <div className="miniError"><AlertCircle size={15} aria-hidden="true" /><span>{studentError}</span></div>}
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

export default function App() {
  const [workspace, setWorkspace] = useState(() => new URLSearchParams(window.location.search).get("workspace") || "home");

  if (workspace === "one-to-one") {
    return (
      <>
        <button className="workspaceBack" type="button" onClick={() => setWorkspace("home")}>
          ← 返回课程类型
        </button>
        <OneToOneWorkspace />
      </>
    );
  }

  if (workspace === "group-class") {
    return <GroupClassWorkspace onBack={() => setWorkspace("home")} />;
  }

  return (
    <main className="courseGateway">
      <div className="gatewayGlow gatewayGlowOne" />
      <div className="gatewayGlow gatewayGlowTwo" />
      <section className="gatewayContent">
        <span className="gatewayEyebrow">TEACHING FEEDBACK STUDIO</span>
        <h1>今天要整理哪一种课程？</h1>
        <p>选择课程类型，进入对应的反馈工作台。</p>
        <div className="courseChoices">
          <button className="courseChoice privateChoice" type="button" onClick={() => setWorkspace("one-to-one")}>
            <span className="choiceIcon">1:1</span>
            <span className="choiceCopy">
              <b>一对一课程反馈</b>
              <small>单个学生 · 个性化反馈 · 家长话术</small>
            </span>
            <span className="choiceArrow">→</span>
          </button>
          <button className="courseChoice groupChoice" type="button" onClick={() => setWorkspace("group-class")}>
            <span className="choiceIcon">班</span>
            <span className="choiceCopy">
              <b>班课反馈</b>
              <small>整班记录 · 连续录分 · 批量生成</small>
            </span>
            <span className="choiceArrow">→</span>
          </button>
        </div>
      </section>
      <style>{gatewayCss}</style>
    </main>
  );
}

const gatewayCss = `
  .workspaceBack { position: fixed; left: 18px; bottom: 18px; z-index: 30; border: 1px solid #cfd9dd; border-radius: 999px; background: rgba(255,255,255,.94); color: #405166; padding: 10px 15px; font-weight: 800; box-shadow: 0 8px 24px rgba(31,55,70,.12); cursor: pointer; }
  .courseGateway { --baby:#dff3ff; --maldives:#48bfd0; --morandi:#799caf; min-height:100vh; display:grid; place-items:center; overflow:hidden; position:relative; padding:28px; background:linear-gradient(145deg,#f8fcfe 0%,#e8f5fa 47%,#dceff5 100%); color:#284757; }
  .gatewayContent { position:relative; z-index:2; width:min(920px,100%); text-align:center; }
  .gatewayEyebrow { display:inline-block; color:#548398; font-size:12px; font-weight:900; letter-spacing:.2em; }
  .gatewayContent h1 { margin:16px 0 8px; font-size:clamp(32px,5vw,54px); letter-spacing:-.04em; }
  .gatewayContent>p { margin:0 0 34px; color:#688493; font-size:17px; }
  .courseChoices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .courseChoice { min-height:190px; display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:20px; border:1px solid rgba(80,130,150,.18); border-radius:28px; padding:28px; text-align:left; color:#284757; cursor:pointer; box-shadow:0 18px 50px rgba(65,108,127,.12); transition:transform .2s,box-shadow .2s; }
  .courseChoice:hover { transform:translateY(-5px); box-shadow:0 24px 60px rgba(65,108,127,.19); }
  .privateChoice { background:#ffffe0; border-color:#ffc0cb; }
  .groupChoice { background:linear-gradient(145deg,#dff3ff,#bfeaf1); }
  .choiceIcon { width:64px; height:64px; display:grid; place-items:center; border-radius:20px; background:#fff; color:#3aaabb; font-size:22px; font-weight:900; box-shadow:0 8px 24px rgba(70,150,170,.12); }
  .privateChoice .choiceIcon,.privateChoice .choiceArrow { color:#a97986; }
  .choiceCopy { display:grid; gap:8px; }
  .choiceCopy b { font-size:22px; }
  .choiceCopy small { color:#688493; font-size:14px; line-height:1.6; }
  .choiceArrow { font-size:27px; color:#5594a6; }
  .gatewayGlow { position:absolute; border-radius:50%; filter:blur(3px); opacity:.65; }
  .gatewayGlowOne { width:360px; height:360px; left:-120px; top:-120px; background:#bdefff; }
  .gatewayGlowTwo { width:440px; height:440px; right:-180px; bottom:-200px; background:#a8d8df; }
  @media(max-width:720px){.courseChoices{grid-template-columns:1fr}.courseChoice{min-height:145px;padding:22px}.gatewayContent{text-align:left}.gatewayContent>p{margin-bottom:24px}.choiceIcon{width:54px;height:54px}.workspaceBack{bottom:10px;left:10px}}
`;

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
            data-value={optionValue}
            className={value === optionValue ? "selected" : ""}
            onClick={() => onChange(optionValue)}
          >
            {labelText === "√" ? <Check size={17} strokeWidth={1.75} aria-hidden="true" /> : labelText === "×" ? <X size={17} strokeWidth={1.75} aria-hidden="true" /> : labelText}
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

/* One-to-one visual refinement: layout and business behavior intentionally unchanged. */
:root {
  --ink: #172b35;
  --muted: #667985;
  --line: #dce5e8;
  --line-strong: #a9ceca;
  --surface: #ffffff;
  --surface-soft: #fafcfc;
  --page: #f4f7f8;
  --brand: #287f78;
  --brand-strong: #216d67;
  --brand-soft: #e8f3f1;
  --danger: #b4585d;
  --danger-soft: #fbeff0;
  --shadow: 0 6px 20px rgba(31, 55, 65, 0.06);
}

body {
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  background: #f4f7f8;
  color: #172b35;
}

.page {
  background: #f4f7f8;
  box-shadow: inset 0 2px 0 #287f78;
}

.hero,
.card {
  border-color: #dce5e8;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 6px 20px rgba(31, 55, 65, 0.06);
}

.tag {
  border-radius: 6px;
  background: #e8f3f1;
  color: #287f78;
  font-weight: 700;
}

.hero h1 {
  color: #172b35;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.hero p {
  color: #667985;
}

.heroMeta span {
  min-height: 34px;
  border-color: #d6e2e5;
  border-radius: 8px;
  background: #ffffff;
  color: #3c555f;
  font-weight: 600;
}

.heroMeta span:first-child {
  border-color: #a9ceca;
  background: #e8f3f1;
  color: #287f78;
}

h2 {
  color: #203a44;
  font-size: 17px;
  font-weight: 650;
}

h3 {
  color: #203a44;
  font-weight: 650;
}

.textInput span,
.item label {
  color: #344e58;
  font-size: 13px;
  font-weight: 600;
}

.textInput em,
.hint {
  color: #80919a;
}

input,
select,
textarea,
.affixInput,
.rating {
  border-color: #d8e3e6;
  border-radius: 8px;
  background: #fafcfc;
  color: #425b65;
  font-size: 14px;
  font-weight: 400;
}

select {
  background-color: #ffffff;
  color: #344e58;
}

textarea {
  padding: 15px;
  line-height: 1.65;
}

input::placeholder,
textarea::placeholder {
  color: #7c8e97;
  opacity: 1;
}

input:focus,
select:focus,
textarea:focus,
.affixInput:focus-within {
  border-color: #287f78;
  background: #ffffff;
  box-shadow: 0 0 0 3px rgba(40, 127, 120, 0.1);
}

.primaryBtn {
  border-radius: 8px;
  background: #287f78;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 5px 14px rgba(40, 127, 120, 0.18);
  transition: background 170ms ease, box-shadow 170ms ease, color 170ms ease;
}

.primaryBtn:hover {
  background: #216d67;
  transform: none;
  box-shadow: 0 6px 16px rgba(40, 127, 120, 0.22);
}

.primaryBtn:active {
  background: #1b5d58;
}

.smallBtn {
  border-color: #d6e2e5;
  border-radius: 8px;
  background: #ffffff;
  color: #3c555f;
  font-weight: 600;
  transition: border-color 170ms ease, background 170ms ease, color 170ms ease;
}

.smallBtn:hover {
  border-color: #a9ceca;
  background: #e8f3f1;
  color: #287f78;
}

.inlineActions .smallBtn:not(.danger) {
  border-color: #a9ceca;
  color: #287f78;
}

.smallBtn.dark {
  border-color: #d6e2e5;
  background: #ffffff;
  color: #607680;
}

.smallBtn.dark svg,
.inlineActions .smallBtn:not(.danger) svg {
  color: #287f78;
}

.smallBtn.dark:hover {
  border-color: #a9ceca;
  background: #f2f7f7;
  color: #287f78;
}

.smallBtn.danger {
  border-color: #edc9cc;
  background: #ffffff;
  color: #b4585d;
}

.smallBtn.danger:hover:not(:disabled) {
  background: #fbeff0;
}

.smallBtn:disabled {
  border-color: #dce5e8;
  background: #fafcfc;
  color: #9aa8ae;
  opacity: 1;
}

.errorBox,
.miniError {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-color: #edc9cc;
  border-radius: 8px;
  background: #fbeff0;
  color: #b4585d;
}

.errorBox svg,
.miniError svg {
  flex: 0 0 auto;
  margin-top: 2px;
  stroke-width: 1.75;
}

.lessonMemoryNote {
  border-color: #cfe2df;
  border-radius: 8px;
  background: #f2f7f6;
  color: #496b6a;
}

.segmented {
  gap: 8px;
}

.segmented button {
  border-color: #d8e3e6;
  border-radius: 8px;
  background: #ffffff;
  color: #526a74;
  transition: border-color 170ms ease, background 170ms ease, color 170ms ease;
}

.segmented button.selected {
  border-color: #287f78;
  background: #287f78;
  color: #ffffff;
}

.segmented button[data-value="未完成"].selected {
  border-color: #b8666d;
  background: #b8666d;
}

.segmented button svg {
  stroke-width: 1.75;
}

.rating {
  background: #ffffff;
}

.rating button {
  color: #cbd5d9;
  font-size: 19px;
  transition: color 160ms ease, background 160ms ease;
}

.rating button.active {
  color: #c79b55;
}

.rating button:hover {
  background: #faf6ee;
  color: #d0ae72;
}

.item textarea,
.feedbackBox {
  border-color: #dce5e8;
  border-radius: 8px;
  background: #fafcfc;
  color: #455d66;
  line-height: 1.65;
}

.item label {
  margin-bottom: 7px;
}

.item textarea::placeholder,
.feedbackBox[readonly] {
  color: #87989f;
}

button,
input,
textarea,
select {
  transition-duration: 170ms;
}

/* Soft yellow and pink theme for the one-to-one workspace. */
:root {
  --ink: #453a3d;
  --muted: #7f7470;
  --line: #eadfc7;
  --line-strong: #ffc0cb;
  --surface-soft: #fffef2;
  --page: #ffffe0;
  --brand: #ffc0cb;
  --brand-strong: #f2aeba;
  --brand-soft: #fff0f3;
  --shadow: 0 6px 20px rgba(101, 79, 67, 0.07);
}

body,
.page {
  background: #ffffe0;
  color: #453a3d;
}

.page {
  box-shadow: inset 0 2px 0 #ffc0cb;
}

.hero,
.card {
  border-color: #eadfc7;
  box-shadow: 0 6px 20px rgba(101, 79, 67, 0.07);
}

.tag,
.heroMeta span:first-child {
  border-color: #ffc0cb;
  background: #fff0f3;
  color: #8d5963;
}

.hero h1 {
  color: #453a3d;
}

.hero p,
.hint,
.textInput em {
  color: #7f7470;
}

.heroMeta span {
  border-color: #eadfc7;
  color: #685b58;
}

h2,
h3 {
  color: #514246;
}

.textInput span,
.item label {
  color: #5f504d;
}

input,
textarea,
.affixInput,
.rating,
.item textarea,
.feedbackBox {
  border-color: #eadfc7;
  background: #fffef2;
  color: #5f5350;
}

select {
  border-color: #eadfc7;
  color: #5f5350;
}

input:focus,
select:focus,
textarea:focus,
.affixInput:focus-within {
  border-color: #ffc0cb;
  box-shadow: 0 0 0 3px rgba(255, 192, 203, 0.22);
}

.primaryBtn {
  background: #ffc0cb;
  color: #68464d;
  box-shadow: 0 5px 14px rgba(218, 143, 156, 0.22);
}

.primaryBtn:hover {
  background: #f2aeba;
  box-shadow: 0 6px 16px rgba(218, 143, 156, 0.25);
}

.primaryBtn:active {
  background: #e89aa8;
}

.smallBtn {
  border-color: #eadfc7;
  color: #685b58;
}

.smallBtn:hover,
.inlineActions .smallBtn:not(.danger):hover {
  border-color: #ffc0cb;
  background: #fff0f3;
  color: #8d5963;
}

.inlineActions .smallBtn:not(.danger),
.smallBtn.dark svg,
.inlineActions .smallBtn:not(.danger) svg {
  border-color: #ffc0cb;
  color: #a36873;
}

.smallBtn.dark:hover {
  border-color: #ffc0cb;
  background: #fff0f3;
  color: #8d5963;
}

.lessonMemoryNote {
  border-color: #f0d3d8;
  background: #fff8e8;
  color: #74615b;
}

.segmented button {
  border-color: #eadfc7;
  color: #71635f;
}

.segmented button.selected {
  border-color: #ffc0cb;
  background: #ffc0cb;
  color: #68464d;
}

.rating button.active {
  color: #b99562;
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
