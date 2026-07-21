import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, MoreHorizontal, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { createGroupClassExcelBlob } from "./excel-template";

const seedStudents = ["陈志祥", "郑力萌", "蔡致远", "张梦晓", "闫浩宇", "关照"];
const juniorOneStudents = ["罗然", "高茜媛", "朱可馨", "杨紫依", "谢光曦", "韩永旭", "林浩轩", "李静怡", "胡欣怡", "陈伟铭", "陈一蔓", "陈诚霖", "张锦瑶", "张锦睿", "翁健雄"];
const CLASS_TIME_OPTIONS = ["8:00-10:00", "10:10-12:10", "13:10-15:10", "14:00-16:00", "16:00-18:00", "15:10-17:10", "17:10-19:10", "19:30-21:30", "19:00-21:00"];
const CLASS_STORAGE_KEY = "teacher-feedback.group-classes.v1";
const GROUP_CLASSES_API = "/api/group-classes";
const GROUP_LESSONS_API = "/api/group-lessons";
const GROUP_FEEDBACK_API = "/api/generate-group-feedback";
const GROUP_TEACHERS = ["陈思桦", "陈嘉仪"];
const DEFAULT_GROUP_TEACHER = "陈嘉仪";
const INITIAL_CLASS_PROFILES = [
  { id: "2026-summer-junior3-math", title: "2026年夏季班", grade: "初三", subject: "数学", defaultTime: "13:10-15:10", students: seedStudents },
  { id: "2026-summer-junior1-math", title: "2026年暑期班", grade: "初一", subject: "数学", defaultTime: "10:10-12:10", students: juniorOneStudents },
];
const commentSeeds = [
  "课堂专注，认真听讲",
  "勤学好问，练习踏实",
  "积极配合，课堂投入",
  "思维活跃，反应较快",
  "听课认真，完成及时",
  "表现稳定，跟进顺畅",
];

function makeStudent(name, index) {
  return { id: `${Date.now()}-${index}`, name, attendance: "出席", homeworkStatus: "已完成", quickNote: "", score: "" };
}

function normalizeClassProfiles(profiles) {
  return profiles.map((profile) => ({ ...profile, students: (profile.students || []).map((student) => typeof student === "string" ? student : student.name).filter(Boolean) }));
}

function classLabel(profile) {
  return [profile.title, `${profile.grade || ""}${profile.subject || ""}`].filter(Boolean).join(" · ");
}

function classIdentity(profile) {
  return classLabel(profile).replace(/[\s·•・]/g, "");
}

function readStoredClasses(teacherName) {
  try {
    const teacherStored = JSON.parse(window.localStorage.getItem(`${CLASS_STORAGE_KEY}.${teacherName}`) || "null");
    if (Array.isArray(teacherStored)) return normalizeClassProfiles(teacherStored);
    if (teacherName === DEFAULT_GROUP_TEACHER) {
      const legacy = JSON.parse(window.localStorage.getItem(CLASS_STORAGE_KEY) || "null");
      if (Array.isArray(legacy) && legacy.length) return normalizeClassProfiles(legacy);
      return normalizeClassProfiles(INITIAL_CLASS_PROFILES);
    }
  } catch {
    return teacherName === DEFAULT_GROUP_TEACHER ? normalizeClassProfiles(INITIAL_CLASS_PROFILES) : [];
  }
  return [];
}

function emptyClassInfo() {
  return { classId: "", title: "", grade: "", subject: "", date: new Date().toISOString().slice(0, 10), time: "13:10-15:10", timeMode: "13:10-15:10", lesson: "1" };
}

export default function GroupClassWorkspace({ onBack }) {
  const [teacherName, setTeacherName] = useState(DEFAULT_GROUP_TEACHER);
  const [classProfiles, setClassProfiles] = useState(() => readStoredClasses(DEFAULT_GROUP_TEACHER));
  const [students, setStudents] = useState(() => (classProfiles[0]?.students || []).map(makeStudent));
  const [classInfo, setClassInfo] = useState(() => classProfiles[0] ? { classId: classProfiles[0].id, title: classProfiles[0].title, grade: classProfiles[0].grade, subject: classProfiles[0].subject, date: new Date().toISOString().slice(0, 10), time: classProfiles[0].defaultTime, timeMode: classProfiles[0].defaultTime, lesson: "1" } : emptyClassInfo());
  const [teacherMenuOpen, setTeacherMenuOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [newStudent, setNewStudent] = useState("");
  const [scoreOpen, setScoreOpen] = useState(false);
  const [scoreIndex, setScoreIndex] = useState(0);
  const [scoreMode, setScoreMode] = useState("pick");
  const [scoreRange, setScoreRange] = useState(20);
  const [typedScore, setTypedScore] = useState("");
  const [scoreError, setScoreError] = useState("");
  const [scoreComplete, setScoreComplete] = useState(false);
  const [savedToast, setSavedToast] = useState("");
  const [activeResult, setActiveResult] = useState("teachingContent");
  const [search, setSearch] = useState("");
  const [menuStudent, setMenuStudent] = useState("");
  const [editingStudent, setEditingStudent] = useState("");
  const [classDialog, setClassDialog] = useState("");
  const [classDraft, setClassDraft] = useState({ info: "", defaultTime: "13:10-15:10" });
  const [apiError, setApiError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState({ teachingContent: "", difficultPoints: "", absorption: "", homework: "" });

  const scoredCount = students.filter((student) => student.score !== "").length;
  const currentStudent = students[scoreIndex];
  const filteredStudents = students.filter((student) => student.name.includes(search.trim()));
  const resultTabs = [
    ["teachingContent", "本节课教学内容"],
    ["difficultPoints", "本节课重难点"],
    ["absorption", "学生吸收情况"],
    ["homework", "作业"],
  ];

  const showProfiles = useCallback((profiles) => {
    setClassProfiles(profiles);
    const first = profiles[0];
    if (!first) {
      setClassInfo(emptyClassInfo());
      setStudents([]);
      return;
    }
    setClassInfo((previous) => ({ ...previous, classId: first.id, title: first.title, grade: first.grade || "", subject: first.subject || "", time: first.defaultTime, timeMode: first.defaultTime, lesson: String((first.lastLessonNumber || 0) + 1) }));
    setStudents((first.students || []).map(makeStudent));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(`${CLASS_STORAGE_KEY}.${teacherName}`, JSON.stringify(classProfiles));
  }, [classProfiles, teacherName]);

  useEffect(() => {
    let cancelled = false;
    async function loadClasses() {
      try {
        const migrationResponse = await fetch(`${GROUP_CLASSES_API}/migrate-presets`, { method: "POST" });
        if (!migrationResponse.ok) {
          const migrationData = await migrationResponse.json();
          throw new Error(migrationData.error || "迁移班级归属失败");
        }
        const response = await fetch(`${GROUP_CLASSES_API}?teacherName=${encodeURIComponent(teacherName)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取班级失败");
        const remoteClasses = [...(data.classes || [])];
        const remoteIdentities = new Set(remoteClasses.map((item) => classIdentity({ title: item.classInfo })));
        const presets = teacherName === DEFAULT_GROUP_TEACHER ? INITIAL_CLASS_PROFILES : [];
        for (const initial of presets.filter((profile) => !remoteIdentities.has(classIdentity(profile)))) {
          const createResponse = await fetch(GROUP_CLASSES_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherName, classInfo: classLabel(initial), defaultTime: initial.defaultTime, students: initial.students }) });
          const created = await createResponse.json();
          if (!createResponse.ok) throw new Error(created.error || "初始化班级失败");
          remoteClasses.push(created.class);
          remoteIdentities.add(classIdentity({ title: created.class.classInfo }));
        }
        const profiles = normalizeClassProfiles(remoteClasses.map((item) => ({ id: item.id, teacherName: item.teacherName, title: item.classInfo, grade: "", subject: "", defaultTime: item.defaultTime, lastLessonNumber: item.lastLessonNumber, students: item.students })));
        if (cancelled) return;
        showProfiles(profiles);
        setApiError("");
      } catch (error) {
        if (cancelled) return;
        setApiError(`${error.message}；当前使用本地缓存。`);
      }
    }
    loadClasses();
    return () => { cancelled = true; };
  }, [showProfiles, teacherName]);

  function selectTeacher(nextTeacher) {
    setTeacherMenuOpen(false);
    setTeacherName(nextTeacher);
    showProfiles(readStoredClasses(nextTeacher));
    setRawText("");
    setResults({ teachingContent: "", difficultPoints: "", absorption: "", homework: "" });
    setSearch("");
    setScoreOpen(false);
    setApiError("");
  }

  function updateClassInfo(key, value) {
    setClassInfo((previous) => ({ ...previous, [key]: value }));
  }

  function updateLessonNumber(value) {
    if (value !== classInfo.lesson) {
      const profile = classProfiles.find((item) => item.id === classInfo.classId);
      setStudents((profile?.students || []).map(makeStudent));
    }
    updateClassInfo("lesson", value);
  }

  function selectClass(classId) {
    const profile = classProfiles.find((item) => item.id === classId);
    if (!profile) return;
    setClassInfo((previous) => ({ ...previous, classId, title: profile.title, grade: profile.grade, subject: profile.subject, time: profile.defaultTime, timeMode: profile.defaultTime }));
    setStudents((profile.students || []).map(makeStudent));
  }

  async function createClass() {
    const info = classDraft.info.trim();
    if (!info) return;
    let profile = { id: `class-${Date.now()}`, title: info, grade: "", subject: "", defaultTime: classDraft.defaultTime, students: [] };
    try {
      const response = await fetch(GROUP_CLASSES_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teacherName, classInfo: info, defaultTime: classDraft.defaultTime }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "创建班级失败");
      profile = { ...profile, id: data.class.id };
      setApiError("");
    } catch (error) {
      setApiError(`${error.message}；班级仅保存在当前浏览器。`);
    }
    setClassProfiles((previous) => [...previous, profile]);
    setClassInfo((previous) => ({ ...previous, classId: profile.id, title: info, grade: "", subject: "", time: profile.defaultTime, timeMode: profile.defaultTime, lesson: "1" }));
    setStudents([]);
    setClassDraft({ info: "", defaultTime: "13:10-15:10" });
    setClassDialog("");
  }

  async function deleteCurrentClass() {
    if (classProfiles.length <= 1) return;
    try {
      const response = await fetch(`${GROUP_CLASSES_API}/${encodeURIComponent(classInfo.classId)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "删除班级失败");
      setApiError("");
    } catch (error) {
      setApiError(error.message);
      return;
    }
    const remaining = classProfiles.filter((profile) => profile.id !== classInfo.classId);
    const next = remaining[0];
    setClassProfiles(remaining);
    setClassInfo((previous) => ({ ...previous, classId: next.id, title: next.title, grade: next.grade, subject: next.subject, time: next.defaultTime, timeMode: next.defaultTime, lesson: "1" }));
    setStudents((next.students || []).map(makeStudent));
    setClassDialog("");
  }

  async function persistRoster(names) {
    if (!classInfo.classId) return;
    try {
      const response = await fetch(`${GROUP_CLASSES_API}/${encodeURIComponent(classInfo.classId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classInfo: classLabel(classInfo), defaultTime: classInfo.timeMode === "其他" ? classInfo.time : classInfo.timeMode, students: names }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存名单失败");
      setApiError("");
    } catch (error) {
      setApiError(`${error.message}；名单改动仅保存在当前浏览器。`);
    }
  }

  async function downloadGroupExcel() {
    if (!classInfo.classId) { setApiError(`请先为${teacherName}新增班级。`); return; }
    try {
      const response = await fetch(GROUP_LESSONS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: classInfo.classId, teacherName, lessonNumber: classInfo.lesson, classDate: classInfo.date, classTime: classInfo.time, rawText, teachingContent: results.teachingContent, difficultPoints: results.difficultPoints, absorption: results.absorption, homework: results.homework, students }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存整节班课失败");
      setApiError("");
    } catch (error) {
      setApiError(error.message);
      return;
    }
    const blob = createGroupClassExcelBlob({
      classTitle: classInfo.title, grade: classInfo.grade, subject: classInfo.subject,
      classDate: classInfo.date, classTime: classInfo.time, lessonNumber: classInfo.lesson,
      teachingContent: results.teachingContent, difficultPoints: results.difficultPoints,
      absorption: results.absorption, homework: results.homework, students,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${classLabel(classInfo)}-第${classInfo.lesson}次-教学反馈.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function updateStudent(id, patch) {
    const studentIndex = students.findIndex((student) => student.id === id);
    setStudents((previous) => previous.map((student) => (student.id === id ? { ...student, ...patch } : student)));
    if (patch.name !== undefined && studentIndex >= 0) {
      const names = students.map((student, index) => index === studentIndex ? patch.name : student.name);
      setClassProfiles((previous) => previous.map((profile) => profile.id === classInfo.classId ? { ...profile, students: (profile.students || []).map((name, index) => index === studentIndex ? patch.name : name) } : profile));
      void persistRoster(names);
    }
  }

  function addStudent() {
    const name = newStudent.trim();
    if (!classInfo.classId) { setApiError(`请先为${teacherName}新增班级。`); return; }
    if (!name || students.some((student) => student.name === name)) return;
    const student = makeStudent(name, students.length);
    setStudents((previous) => [...previous, student]);
    setClassProfiles((previous) => previous.map((profile) => profile.id === classInfo.classId ? { ...profile, students: [...(profile.students || []), name] } : profile));
    void persistRoster([...students.map((item) => item.name), name]);
    setNewStudent("");
  }

  function removeStudent(id) {
    const studentIndex = students.findIndex((student) => student.id === id);
    setStudents((previous) => previous.filter((student) => student.id !== id));
    if (studentIndex >= 0) {
      const names = students.filter((_, index) => index !== studentIndex).map((student) => student.name);
      setClassProfiles((previous) => previous.map((profile) => profile.id === classInfo.classId ? { ...profile, students: (profile.students || []).filter((_, index) => index !== studentIndex) } : profile));
      void persistRoster(names);
    }
  }

  function openRecorder(index = 0) {
    const firstUnscored = students.findIndex((student) => student.score === "" && student.attendance === "出席");
    setScoreIndex(index || Math.max(firstUnscored, 0));
    setScoreComplete(false);
    setScoreError("");
    setScoreOpen(true);
  }

  function moveScore(direction) {
    if (!students.length) return;
    setScoreIndex((previous) => Math.min(Math.max(previous + direction, 0), students.length - 1));
    setTypedScore("");
  }

  function saveScore(value) {
    const score = Number(value);
    if (!currentStudent || value === "" || !Number.isInteger(score) || score < 0 || score > 30) {
      setScoreError("请输入 0–30 的整数");
      return;
    }
    updateStudent(currentStudent.id, { score: String(score) });
    setSavedToast(`${currentStudent.name}：${score}分已保存`);
    setTypedScore("");
    setScoreError("");
    window.setTimeout(() => setSavedToast(""), 1200);
    if (scoreIndex < students.length - 1) setScoreIndex((previous) => previous + 1);
    else setScoreComplete(true);
  }

  function skipScore() {
    setTypedScore("");
    if (scoreIndex < students.length - 1) setScoreIndex((previous) => previous + 1);
    else setScoreComplete(true);
  }

  function markAbsent() {
    if (!currentStudent) return;
    updateStudent(currentStudent.id, { score: "缺考" });
    setSavedToast(`${currentStudent.name}：缺考已保存`);
    window.setTimeout(() => setSavedToast(""), 1200);
    if (scoreIndex < students.length - 1) setScoreIndex((previous) => previous + 1);
    else setScoreComplete(true);
  }

  async function generateDraft() {
    if (!rawText.trim()) { setApiError("请先填写整班课堂记录。"); return; }
    setGenerating(true);
    setApiError("");
    try {
      const response = await fetch(GROUP_FEEDBACK_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classInfo: classLabel(classInfo), rawText, students }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成班课反馈失败");
      const comments = new Map((data.students || []).map((item) => [item.name, item.performanceComment]));
      setStudents((previous) => previous.map((student, index) => ({ ...student, quickNote: comments.get(student.name) || student.quickNote || commentSeeds[index % commentSeeds.length] })));
      setResults({ teachingContent: data.teachingContent || "", difficultPoints: data.difficultPoints || "", absorption: data.absorption || "", homework: data.homework || "" });
    } catch (error) {
      setApiError(error.message);
    } finally {
      setGenerating(false);
    }
  }

  const rangeScores = scoreRange === 20
    ? Array.from({ length: 11 }, (_, index) => index + 20)
    : Array.from({ length: 10 }, (_, index) => index + scoreRange);

  return (
    <div className="groupShell">
      <header className="groupTopbar">
        <button className="backButton" type="button" onClick={onBack}><ArrowLeft size={18} />课程类型</button>
        <div className="groupBrand"><span>班</span><div><b>班级反馈工作台</b><small>CLASS FEEDBACK</small></div></div>
        <div className="teacherPicker"><button className="teacherSwitch" type="button" aria-haspopup="menu" aria-expanded={teacherMenuOpen} onClick={() => setTeacherMenuOpen((open) => !open)}><span>{teacherName.slice(0, 1)}</span><b>{teacherName}</b><ChevronDown className={teacherMenuOpen ? "open" : ""} size={15} /></button>{teacherMenuOpen && <div className="teacherMenu" role="menu">{GROUP_TEACHERS.map((teacher) => <button className={teacher === teacherName ? "active" : ""} role="menuitem" type="button" key={teacher} onClick={() => selectTeacher(teacher)}><span>{teacher.slice(0, 1)}</span><div><b>{teacher}</b><small>{teacher === teacherName ? "当前老师" : "切换老师"}</small></div>{teacher === teacherName && <Check size={15} />}</button>)}</div>}</div>
      </header>

      <main className="groupMain">
        <section className="courseWorkspace">
          <header className="courseOverview"><div><span>当前班级 · {teacherName}</span><h1>{classInfo.classId ? classLabel(classInfo) : "请先新增班级"}</h1><p>{classInfo.date} <span>{classInfo.time}</span></p></div><div className="overviewStats"><b>{students.length}<small>学员</small></b><b>{scoredCount}<small>已完成</small></b><b>第{classInfo.lesson}次<small>当前课次</small></b></div></header>
          <div className="workspaceSection"><div className="workspaceTitle"><div><h2>本节课信息</h2><p>班级档案绑定学生名单和默认上课时段</p></div></div><div className="leftInfoGrid"><div className="classPicker classManager"><label className="groupField"><span>班级信息</span><select value={classInfo.classId} onChange={(event) => selectClass(event.target.value)}><option value="">{classProfiles.length ? "选择班级" : `${teacherName}暂无班级`}</option>{classProfiles.map((profile) => <option key={profile.id} value={profile.id}>{classLabel(profile)}</option>)}</select></label><div><button type="button" onClick={() => setClassDialog("create")}><Plus size={15} />新增</button><button className="classDelete" disabled={classProfiles.length <= 1} type="button" onClick={() => setClassDialog("delete")}><Trash2 size={15} />删除</button></div></div><Field label="上课日期" type="date" value={classInfo.date} onChange={(value) => updateClassInfo("date", value)} /><ClassTimeField value={classInfo.time} mode={classInfo.timeMode} onChange={(time, timeMode) => setClassInfo((previous) => ({ ...previous, time, timeMode }))} /><Field label="课次" type="number" value={classInfo.lesson} onChange={updateLessonNumber} /></div></div>
          <div className="workspaceSection aiSection"><div className="workspaceTitle"><div><h2>课堂记录与反馈生成</h2><p>记录本节内容、重点和整体课堂情况</p></div><div className="saveState"><Check size={15} />自动保存</div></div><textarea className="classNotes" disabled={!classInfo.classId} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：本节课学习一元二次方程的概念、开平方法和配方法；重点练习二次三项式最值问题……" />{apiError && <div className="groupApiError">{apiError}</div>}<div className="generateRow"><button className="generateGroup" disabled={generating || !classInfo.classId} type="button" onClick={generateDraft}><Sparkles size={18} />{generating ? "AI生成中..." : "生成班级反馈"}</button><button className="excelDownload" disabled={!classInfo.classId} type="button" onClick={downloadGroupExcel}><Download size={17} />保存并下载Excel</button></div><div className="resultTabs">{resultTabs.map(([key, label]) => <button className={activeResult === key ? "active" : ""} type="button" key={key} onClick={() => setActiveResult(key)}>{label}</button>)}</div><textarea className="tabResultEditor" value={results[activeResult]} onChange={(event) => setResults((previous) => ({ ...previous, [activeResult]: event.target.value }))} placeholder="生成后可在这里继续编辑" /></div>
        </section>

        <section className="studentWorkspace">
          <header className="studentWorkspaceHeader"><div className="studentHeading"><div><h2>学生课堂记录</h2><p>记录可留空，AI将自动补充差异化点评</p></div><div className="completion"><b>已完成 {scoredCount}/{students.length}</b><i><span style={{ width: `${students.length ? (scoredCount / students.length) * 100 : 0}%` }} /></i></div></div><div className="studentActions"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索学生" /></label><button className="scoreLaunch" type="button" disabled={!students.length} onClick={() => openRecorder()}><ClipboardCheck size={16} />快速录分</button><button className="secondaryAdd" type="button" onClick={() => document.querySelector('.addStudentRow input')?.focus()}><Plus size={16} />添加学生</button></div></header>
          <div className="studentCardList">{!classInfo.classId ? <div className="emptyTeacherState"><span><Plus size={23} /></span><h3>{teacherName}还没有班级</h3><p>新增班级后，学生名单和课堂记录会单独归属于这位老师。</p><button type="button" onClick={() => setClassDialog("create")}><Plus size={15} />新增班级</button></div> : filteredStudents.map((student) => { const index = students.findIndex((item) => item.id === student.id); return <article className={`studentRecordCard ${editingStudent === student.id ? "editing" : ""}`} key={student.id}>
            {student.score !== "" && <span className="studentDone"><Check size={12} /></span>}
            <div className="studentCardTop"><span className="studentIndex">{String(index + 1).padStart(2, "0")}</span><input className="studentFullName" value={student.name} onFocus={() => setEditingStudent(student.id)} onBlur={() => setEditingStudent("")} onChange={(event) => updateStudent(student.id, { name: event.target.value })} /><MiniSegment kind="attendance" value={student.attendance} options={["出席", "请假", "缺席"]} onChange={(attendance) => updateStudent(student.id, { attendance })} /><MiniSegment kind="homework" value={student.homeworkStatus} options={["已完成", "部分", "未完成"]} onChange={(homeworkStatus) => updateStudent(student.id, { homeworkStatus })} /><div className="moreCell"><button className="moreButton" type="button" onClick={() => setMenuStudent(menuStudent === student.id ? "" : student.id)}><MoreHorizontal size={18} /></button>{menuStudent === student.id && <div className="rowMenu"><button type="button" onClick={() => { removeStudent(student.id); setMenuStudent(""); }}>删除学生</button></div>}</div></div>
            <div className="studentCardBottom"><input className="quickInput" value={student.quickNote} onFocus={() => setEditingStudent(student.id)} onBlur={() => setEditingStudent("")} onChange={(event) => updateStudent(student.id, { quickNote: event.target.value })} placeholder="课堂表现（可自由修改，也可留空）" /><button className={`scoreCell ${student.score !== "" ? "filled" : ""}`} type="button" onClick={() => openRecorder(index)}>{student.score === "" ? "+ 录分" : student.score === "缺考" ? "缺考" : `${student.score} / 30`}</button></div>
          </article> })}</div>
          <footer className="addStudentRow"><span>{students.length} 名学生</span><div><input disabled={!classInfo.classId} value={newStudent} onChange={(event) => setNewStudent(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addStudent()} placeholder={classInfo.classId ? "输入新学员姓名" : "请先新增班级"} /><button disabled={!classInfo.classId} type="button" onClick={addStudent}><Plus size={15} />添加</button></div></footer>
        </section>
      </main>

      {classDialog === "create" && <div className="classDialogOverlay"><section className="classDialog"><header><div><h2>新增班级</h2><p>班级信息、默认时段和学生名单将绑定保存</p></div><button type="button" onClick={() => setClassDialog("")}><X size={18} /></button></header><div className="classDialogGrid simpleClassDialog"><Field label="班级信息" value={classDraft.info} onChange={(info) => setClassDraft((previous) => ({ ...previous, info }))} /><label className="groupField"><span>默认时段</span><select value={classDraft.defaultTime} onChange={(event) => setClassDraft((previous) => ({ ...previous, defaultTime: event.target.value }))}>{CLASS_TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}</select></label></div><footer><button type="button" onClick={() => setClassDialog("")}>取消</button><button className="primaryDialogAction" type="button" onClick={createClass}>创建班级</button></footer></section></div>}
      {classDialog === "delete" && <div className="classDialogOverlay"><section className="classDialog dangerDialog"><span className="dangerIcon"><AlertTriangle size={30} /></span><h2>确认删除整个班级？</h2><p>将永久删除“{classLabel(classInfo)}”，并连带删除右侧该班级的 <b>{students.length} 名学生</b>。此操作无法撤销。</p>{classProfiles.length <= 1 && <div className="onlyClassWarning">当前是唯一班级，请先新增其他班级后再删除。</div>}<footer><button type="button" onClick={() => setClassDialog("")}>取消</button><button className="dangerDialogAction" disabled={classProfiles.length <= 1} type="button" onClick={deleteCurrentClass}>删除班级及学生</button></footer></section></div>}

      {scoreOpen && currentStudent && (
        <div className="scoreOverlay" role="dialog" aria-modal="true" aria-label="连续录入入门测成绩">
          <button className="overlayDismiss" type="button" onClick={() => setScoreOpen(false)} aria-label="关闭录分"><X /></button>
          <section className="scoreRecorder">
            {scoreComplete ? <div className="scoreComplete"><span><Check size={28} /></span><h2>录分完成</h2><p>已完成本次入门测试成绩录入</p><button type="button" onClick={() => setScoreOpen(false)}>返回学生课堂记录</button></div> : <>
            <div className="recorderHeader"><div><span>入门测连续录分</span><h2>{currentStudent.name}</h2><p>第 {scoreIndex + 1} 位，共 {students.length} 位</p></div><div className="scoreProgress"><i style={{ width: `${((scoreIndex + 1) / students.length) * 100}%` }} /></div></div>
            <div className="recorderModes"><button className={scoreMode === "pick" ? "active" : ""} type="button" onClick={() => setScoreMode("pick")}>点选分数</button><button className={scoreMode === "type" ? "active" : ""} type="button" onClick={() => setScoreMode("type")}>键盘填分</button></div>
            {scoreMode === "pick" ? <>
              <div className="rangeTabs">{[0, 10, 20].map((range) => <button className={scoreRange === range ? "active" : ""} key={range} type="button" onClick={() => setScoreRange(range)}>{range === 20 ? "20–30" : `${range}–${range + 10}`}</button>)}</div>
              <div className="scoreButtons">{rangeScores.map((score) => <button className={currentStudent.score === String(score) ? "selected" : ""} key={score} type="button" onClick={() => saveScore(score)}>{score}</button>)}</div>
              <div className="absentRow"><button type="button" onClick={markAbsent}>缺考</button><p className="autoHint">点击一次即保存并进入下一位</p></div>
            </> : <form key={scoreIndex} className="typeScore" onSubmit={(event) => { event.preventDefault(); saveScore(typedScore); }}><label><input autoFocus inputMode="numeric" min="0" max="30" type="number" value={typedScore} onChange={(event) => { setTypedScore(event.target.value); setScoreError(""); }} placeholder="—" /><span>/ 30</span></label><p>输入 0–30 的整数，按 Enter 录入并进入下一位</p>{scoreError && <em>{scoreError}</em>}</form>}
            <footer className="recorderFooter"><button type="button" disabled={scoreIndex === 0} onClick={() => moveScore(-1)}><ChevronLeft size={18} />上一位</button><div>{students.map((student, index) => <button title={student.name} aria-label={`切换到${student.name}`} className={`${index === scoreIndex ? "current" : ""} ${student.score !== "" ? "done" : ""}`} key={student.id} type="button" onClick={() => setScoreIndex(index)} />)}</div><button type="button" onClick={skipScore}>跳过<ChevronRight size={18} /></button></footer>
            </>}
          </section>
          {savedToast && <div className="savedToast"><Check size={15} />{savedToast}</div>}
        </div>
      )}
      <style>{groupCss}</style>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", readOnly = false }) {
  return <label className="groupField"><span>{label}</span><input type={type} min={type === "number" ? "1" : undefined} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ClassTimeField({ value, mode, onChange }) {
  return <label className="groupField classTimeField"><span>上课时间</span><select value={mode} onChange={(event) => { const nextMode = event.target.value; onChange(nextMode === "其他" ? "" : nextMode, nextMode); }}>{CLASS_TIME_OPTIONS.map((time) => <option key={time}>{time}</option>)}<option>其他</option></select>{mode === "其他" && <input autoFocus value={value} onChange={(event) => onChange(event.target.value, "其他")} placeholder="例如 9:00-11:00" />}</label>;
}

function MiniSegment({ value, options, onChange, kind }) {
  return <div className={`miniSegment ${kind}`}>{options.map((option, index) => <button className={`state-${index} ${value === option ? "active" : ""}`} key={option} type="button" onClick={() => onChange(option)}>{option}</button>)}</div>;
}

const groupCss = `
  .groupShell{--baby:#dff3ff;--maldives:#43bccb;--deep:#397f98;--morandi:#7399aa;--ink:#254454;--muted:#6b8795;--line:#cfe1e8;min-height:100vh;background:#f2f8fa;color:var(--ink);font-family:Inter,"Microsoft YaHei",sans-serif}.groupShell *{box-sizing:border-box}.groupTopbar{height:72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 32px;background:rgba(250,253,254,.92);border-bottom:1px solid #dce9ed;position:sticky;top:0;z-index:20;backdrop-filter:blur(16px)}.backButton{justify-self:start;display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#587786;font-weight:800;cursor:pointer}.groupBrand{display:flex;align-items:center;gap:11px}.groupBrand>span{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#79d7e2,#40b5c7);color:#fff;font-weight:900}.groupBrand div{display:grid}.groupBrand b{font-size:15px}.groupBrand small{font-size:10px;color:#84a0ad;text-transform:uppercase;letter-spacing:.12em}.saveState{justify-self:end;display:flex;align-items:center;gap:6px;color:#668792;font-size:12px}.groupMain{width:min(1380px,calc(100% - 40px));margin:0 auto;padding:28px 0 70px}.classHero{min-height:190px;display:flex;justify-content:space-between;align-items:center;gap:30px;padding:34px 40px;margin-bottom:20px;border-radius:28px;background:linear-gradient(125deg,#dff3ff 0%,#caedf4 48%,#a9dce5 100%);box-shadow:0 18px 45px rgba(65,120,140,.12)}.bluePill{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.65);color:#43889b;font-size:11px;font-weight:900}.classHero h1{margin:13px 0 7px;font-size:clamp(27px,3vw,40px);letter-spacing:-.035em}.classHero p{margin:0;color:#5d8191}.heroStats{display:flex;gap:10px}.heroStats div{min-width:104px;padding:18px;border:1px solid rgba(255,255,255,.62);border-radius:19px;background:rgba(255,255,255,.48);text-align:center}.heroStats b,.heroStats span{display:block}.heroStats b{font-size:20px}.heroStats span{margin-top:5px;color:#648594;font-size:11px}.groupCard{margin-bottom:20px;padding:26px;border:1px solid #dce9ed;border-radius:23px;background:#fff;box-shadow:0 10px 30px rgba(50,91,109,.06)}.sectionHeading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.sectionHeading>div{display:flex;align-items:center;gap:12px}.sectionHeading h2,.sectionHeading p{margin:0}.sectionHeading h2{font-size:19px}.sectionHeading p{margin-top:4px;color:#8098a3;font-size:12px}.stepBadge{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:var(--baby);color:#3f93a8;font-size:12px;font-weight:900}.classInfoGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px}.groupField{display:grid;gap:7px}.groupField span{color:#617e8c;font-size:12px;font-weight:800}.groupField input,.addStudentRow input,.quickInput{width:100%;border:1px solid var(--line);border-radius:11px;background:#fbfdfe;color:var(--ink);padding:11px 12px;outline:none}.groupField input:focus,.addStudentRow input:focus,.quickInput:focus,.classNotes:focus,.resultCard textarea:focus{border-color:var(--maldives);box-shadow:0 0 0 3px rgba(67,188,203,.12)}.scoreLaunch{display:flex;align-items:center;gap:8px;border:0;border-radius:12px;background:#3eaec0;color:#fff;padding:11px 14px;font-weight:800;cursor:pointer}.scoreLaunch span{padding:3px 7px;border-radius:99px;background:rgba(255,255,255,.18);font-size:11px}.studentTableWrap{overflow-x:auto}.studentTable{width:100%;border-collapse:collapse;min-width:1060px}.studentTable th{padding:10px;color:#78909b;font-size:11px;text-align:left;border-bottom:1px solid #dce8ec}.studentTable td{padding:10px 7px;border-bottom:1px solid #edf3f5}.studentName{display:flex;align-items:center;gap:9px}.studentName>span{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:#e8f6fa;color:#4a91a2;font-size:11px;font-weight:900}.studentName input{width:92px;border:0;background:transparent;color:var(--ink);font-weight:800;outline:none}.miniSegment{display:flex;padding:3px;border-radius:10px;background:#eef5f7}.miniSegment button{border:0;border-radius:8px;background:transparent;color:#78909b;padding:7px 9px;font-size:11px;cursor:pointer;white-space:nowrap}.miniSegment button.active{background:#fff;color:#367f93;font-weight:900;box-shadow:0 2px 8px rgba(55,95,110,.1)}.scoreCell{min-width:72px;border:1px dashed #9fc8d2;border-radius:10px;background:#f3fbfc;color:#4d91a2;padding:9px;cursor:pointer;font-weight:800}.scoreCell.filled{border-style:solid;background:#dff5f6;color:#287d8e}.removeStudent{border:0;background:transparent;color:#a5b6be;cursor:pointer}.addStudentRow{display:flex;gap:9px;margin-top:16px}.addStudentRow input{max-width:230px}.addStudentRow button{border:0;border-radius:11px;background:#e1f2f6;color:#3b8295;padding:0 15px;font-weight:800;cursor:pointer}.classNotes{width:100%;min-height:160px;resize:vertical;border:1px solid var(--line);border-radius:15px;background:#fbfdfe;padding:16px;color:var(--ink);font:inherit;line-height:1.7;outline:none}.generateGroup{width:100%;display:flex;justify-content:center;align-items:center;gap:9px;margin-top:13px;border:0;border-radius:13px;background:linear-gradient(100deg,#4fc1cd,#3b9eb5);color:#fff;padding:14px;font-weight:900;cursor:pointer;box-shadow:0 9px 22px rgba(60,165,182,.2)}.resultGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.resultCard{overflow:hidden;border:1px solid #dce8ec;border-radius:20px;background:#fff}.resultCard header{padding:15px 19px;font-size:17px}.resultCard textarea{width:100%;min-height:150px;border:0;border-top:1px solid #e8f0f2;padding:17px;resize:vertical;color:var(--ink);font:inherit;line-height:1.65;outline:none}.resultCard.pink header{background:#f4d5db}.resultCard.aqua header{background:#bdeae8}.resultCard.green header{background:#cbe8b8}.resultCard.yellow header{background:#f8e7a8}.scoreOverlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(27,53,65,.58);backdrop-filter:blur(8px)}.overlayDismiss{position:absolute;right:25px;top:22px;border:0;background:transparent;color:#fff;cursor:pointer}.scoreRecorder{width:min(620px,100%);border-radius:28px;background:#f9fdfe;box-shadow:0 30px 90px rgba(14,42,55,.35);overflow:hidden}.recorderHeader{padding:28px 30px 20px;background:linear-gradient(125deg,#dff3ff,#b9e7ef)}.recorderHeader span{color:#4a8ea1;font-size:11px;font-weight:900;letter-spacing:.1em}.recorderHeader h2{margin:7px 0 2px;font-size:31px}.recorderHeader p{margin:0;color:#6b8997;font-size:13px}.scoreProgress{height:5px;margin-top:20px;border-radius:99px;background:rgba(255,255,255,.7);overflow:hidden}.scoreProgress i{display:block;height:100%;border-radius:inherit;background:#3aaabd;transition:width .2s}.recorderModes{display:grid;grid-template-columns:1fr 1fr;margin:20px 28px 0;padding:4px;border-radius:12px;background:#eaf3f6}.recorderModes button,.rangeTabs button{border:0;border-radius:9px;background:transparent;color:#78929e;padding:10px;font-weight:800;cursor:pointer}.recorderModes button.active,.rangeTabs button.active{background:#fff;color:#35869a;box-shadow:0 3px 10px rgba(60,95,110,.1)}.rangeTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:18px 28px 0}.scoreButtons{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:20px 28px 8px}.scoreButtons button{aspect-ratio:1;border:1px solid #cae2e8;border-radius:15px;background:#fff;color:#31596a;font-size:18px;font-weight:900;cursor:pointer;transition:.15s}.scoreButtons button:hover{transform:translateY(-2px);border-color:#43bccc;background:#dff5f7;color:#237d8f}.autoHint{text-align:center;color:#88a0aa;font-size:12px}.typeScore{display:grid;justify-items:center;padding:34px 28px 23px}.typeScore label{display:flex;align-items:baseline;gap:12px}.typeScore input{width:150px;border:0;border-bottom:3px solid #76c9d5;background:transparent;color:#285365;font-size:58px;font-weight:900;text-align:center;outline:none}.typeScore label span{color:#78929e;font-size:20px}.typeScore>button{margin-top:25px;border:0;border-radius:12px;background:#3aaabc;color:#fff;padding:12px 22px;font-weight:900;cursor:pointer}.typeScore p{color:#8da2ab;font-size:12px}.recorderFooter{display:grid;grid-template-columns:100px 1fr 100px;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid #e2edf0}.recorderFooter>button{display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#648390;font-weight:800;cursor:pointer}.recorderFooter>button:disabled{opacity:.3}.recorderFooter>div{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}.recorderFooter>div button{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:#d2e0e5;cursor:pointer}.recorderFooter>div button.done{background:#70c9d3}.recorderFooter>div button.current{outline:3px solid rgba(65,181,198,.2);background:#2e99ad}.scoreLaunch:disabled{opacity:.45;cursor:not-allowed}@media(max-width:1050px){.classInfoGrid{grid-template-columns:repeat(3,1fr)}.classHero{align-items:flex-start;flex-direction:column}.heroStats{width:100%}.heroStats div{flex:1}.resultGrid{grid-template-columns:1fr}}@media(max-width:680px){.groupTopbar{grid-template-columns:auto 1fr;height:62px;padding:0 15px}.groupBrand{justify-self:end}.saveState{display:none}.groupMain{width:min(100% - 22px,1380px);padding-top:12px}.classHero{padding:24px;border-radius:21px}.heroStats{overflow-x:auto}.heroStats div{min-width:90px}.groupCard{padding:18px;border-radius:18px}.sectionHeading{align-items:flex-start;flex-direction:column}.scoreLaunch{width:100%;justify-content:center}.classInfoGrid{grid-template-columns:repeat(2,1fr)}.scoreButtons{grid-template-columns:repeat(4,1fr)}.recorderFooter{grid-template-columns:75px 1fr 75px;padding:14px 10px}.groupBrand small{display:none}}
  /* Dense desktop workspace v2 */
  .groupShell{background:#f4f8fa}.groupTopbar{height:58px;grid-template-columns:1fr auto 1fr;padding:0 24px}.groupBrand{justify-self:center}.groupBrand>span{width:32px;height:32px;border-radius:10px}.teacherSwitch{justify-self:end;display:flex;align-items:center;gap:6px;border:1px solid #dbe7eb;border-radius:10px;background:#fff;color:#486674;padding:5px 8px;cursor:pointer}.teacherSwitch>span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#dff3f7;color:#2f8799;font-weight:900}.teacherSwitch select{appearance:none;border:0;background:transparent;color:#486674;padding:2px 0;font:700 12px Inter,"Microsoft YaHei",sans-serif;outline:none;cursor:pointer}.teacherSwitch svg{pointer-events:none}.groupMain{width:min(1200px,calc(100% - 32px));padding:18px 0 42px}.classHero{min-height:118px;padding:22px 26px;margin-bottom:14px;border:1px solid #dce9ed;border-radius:15px;background:#fff;box-shadow:0 6px 20px rgba(41,76,92,.05)}.bluePill{padding:4px 8px;background:#e6f5f8;font-size:10px}.classHero h1{margin:8px 0 5px;font-size:25px}.classHero p{font-size:12px}.heroStats div{min-width:112px;padding:12px 16px;border-color:#deeaee;border-radius:12px;background:#f8fbfc}.heroStats b{font-size:18px}.groupCard{margin-bottom:14px;padding:18px 20px;border-radius:15px;box-shadow:0 4px 16px rgba(42,77,93,.045)}.sectionHeading{margin-bottom:14px}.compactHeading h2,.sectionHeading h2{font-size:16px}.classInfoGrid{gap:10px}.groupField{gap:5px}.groupField input{height:38px;border-radius:8px;padding:8px 10px}.classNotes{min-height:118px;border-radius:10px;padding:12px 14px}.generateRow{display:flex;align-items:center;gap:14px;margin-top:10px}.generateRow .generateGroup{width:auto;min-width:190px;margin:0;padding:11px 18px;border-radius:9px}.generateRow>span{color:#8aa0aa;font-size:11px}.resultTabs{display:flex;gap:4px;margin-top:16px;border-bottom:1px solid #dce7eb}.resultTabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:#718b96;padding:10px 16px;font-weight:700;cursor:pointer}.resultTabs button.active{border-bottom-color:#35a9ba;color:#267f90}.tabResultEditor{width:100%;min-height:100px;border:0;background:#fbfdfe;color:var(--ink);padding:13px 14px;resize:vertical;font:inherit;line-height:1.6;outline:none}.studentManagement{padding-bottom:0}.studentActions{display:flex;align-items:center;gap:8px}.studentActions label{height:36px;display:flex;align-items:center;gap:6px;border:1px solid #d6e4e8;border-radius:9px;padding:0 9px;color:#76909b}.studentActions label input{width:110px;border:0;outline:none;color:var(--ink)}.studentActions .scoreLaunch,.secondaryAdd{height:36px;border-radius:9px;padding:0 12px}.secondaryAdd{display:flex;align-items:center;gap:5px;border:1px solid #cddfe4;background:#fff;color:#467686;font-weight:800;cursor:pointer}.completion{display:flex!important;align-items:center!important;gap:9px!important;margin-left:14px}.completion b{color:#587886;font-size:11px}.completion i{width:90px;height:5px;border-radius:99px;background:#e8f0f3;overflow:hidden}.completion i span{display:block;height:100%;background:#42b6c5}.studentTableWrap{height:388px;overflow:auto;border-top:1px solid #e3ecef;border-bottom:1px solid #e3ecef;scrollbar-width:thin;scrollbar-color:#bfd2d9 transparent}.studentTableWrap::-webkit-scrollbar{width:6px;height:6px}.studentTableWrap::-webkit-scrollbar-thumb{border-radius:99px;background:#bfd2d9}.studentTable thead{position:sticky;top:0;z-index:3;background:#f7fafb}.studentTable th{height:38px;padding:8px 7px}.studentTable tbody tr{height:55px;transition:background .15s}.studentTable tbody tr:hover{background:#f2fafc}.studentTable td{padding:7px}.rowNumber{width:48px;color:#91a5ad;font-size:11px}.studentName>span{width:28px;height:28px;border-radius:50%}.studentName input{width:76px}.miniSegment{padding:2px;border:1px solid #e0eaed;border-radius:8px;background:#fff}.miniSegment button{border-radius:6px;padding:6px 7px}.miniSegment button.active{background:#e4f4f7;box-shadow:none}.quickInput{height:34px;border-radius:8px;padding:7px 9px}.scoreCell{border-style:solid;border-radius:8px;background:#fff;padding:7px 9px}.scoreCell.filled{background:#e6f6f8}.moreCell{position:relative}.moreButton{border:0;background:transparent;color:#7e969f;cursor:pointer}.rowMenu{position:absolute;right:24px;top:40px;z-index:8;padding:5px;border:1px solid #dce7ea;border-radius:8px;background:#fff;box-shadow:0 8px 22px rgba(30,60,75,.14)}.rowMenu button{border:0;background:transparent;color:#b04c58;padding:7px 12px;white-space:nowrap;cursor:pointer}.addStudentRow{position:sticky;bottom:0;min-height:54px;display:flex;align-items:center;justify-content:space-between;margin:0;background:#fff}.addStudentRow>span{color:#849aa4;font-size:11px}.addStudentRow>div{display:flex;gap:7px}.addStudentRow input{height:34px;max-width:190px;border-radius:8px}.addStudentRow button{height:34px;display:flex;align-items:center;gap:4px;border-radius:8px}.scoreRecorder{width:min(580px,100%);border-radius:16px}.recorderHeader{padding:22px 26px 17px;background:#f3fafc}.recorderHeader h2{font-size:25px}.recorderModes{margin-top:15px}.scoreButtons{gap:8px}.scoreButtons button{border-radius:10px}.scoreButtons button.selected{border-color:#2c9fb1;background:#35aabc;color:#fff}.absentRow{display:flex;align-items:center;justify-content:center;gap:14px;margin:4px 28px 14px}.absentRow>button{border:1px solid #c8d9de;border-radius:8px;background:#fff;color:#6d8792;padding:7px 18px;font-weight:800;cursor:pointer}.autoHint{margin:0}.recorderFooter{padding:13px 20px}
  .groupField select{width:100%;height:38px;border:1px solid var(--line);border-radius:8px;background:#fbfdfe;color:var(--ink);padding:8px 10px;outline:none}.groupField input[readonly]{background:#f5f8f9;color:#667f8a;cursor:default}.classTimeField{position:relative}.classTimeField input{position:absolute;top:63px;z-index:6;background:#fff;box-shadow:0 8px 20px rgba(35,67,82,.14)}.studentTable th:nth-child(1){width:48px}.studentTable th:nth-child(2){width:105px}.studentTable th:nth-child(3){width:166px}.studentTable th:nth-child(4){width:192px}.studentTable th:nth-child(6){width:82px}.studentTable th:nth-child(7){width:52px}.studentName{display:block}.studentName input{width:82px}.miniSegment{display:inline-flex;width:max-content;padding:2px;gap:2px;border:0;background:#f3f5f6}.miniSegment button{font-weight:700}.miniSegment button:not(.active){color:#7c8d95;background:transparent}.miniSegment.attendance .state-0.active{color:#246c8e;background:#DCEFF8}.miniSegment.homework .state-0.active{color:#247080;background:#DDF2F4}.miniSegment .state-1.active{color:#8b5c10;background:#FFF3D6}.miniSegment .state-2.active{color:#963b45;background:#FDEBEC}.scoreCell{min-width:64px;height:31px;border-color:#c9dce3!important;border-radius:7px!important;background:#f7fafb!important;color:#568090!important;padding:4px 8px!important;font-size:11px;white-space:nowrap}.scoreCell:hover{border-color:#7fb9ca!important;background:#edf7fa!important;color:#2c8298!important}.scoreCell.filled{border-color:#9ccbd6!important;background:#e9f6f8!important;color:#277d90!important}.addStudentRow button{white-space:nowrap;flex-shrink:0}.typeScore{min-height:190px}.typeScore p{margin-top:18px}.typeScore em{color:#b3434c;font-size:12px;font-style:normal}.scoreComplete{display:grid;justify-items:center;padding:46px 30px}.scoreComplete>span{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:#e2f6f0;color:#27805f}.scoreComplete h2{margin:17px 0 5px}.scoreComplete p{margin:0;color:#7a929d}.scoreComplete button{margin-top:24px;border:0;border-radius:9px;background:#35aabc;color:#fff;padding:11px 18px;font-weight:800;cursor:pointer}.savedToast{position:absolute;left:50%;bottom:24px;display:flex;align-items:center;gap:7px;transform:translateX(-50%);border-radius:9px;background:#244f5e;color:#fff;padding:9px 13px;font-size:12px;box-shadow:0 8px 24px rgba(20,50,65,.22);pointer-events:none}.scoreButtons button{transition:none}
  /* Two-column classroom workspace */
  .groupShell{--ink:#18343E;--muted:#647C86;--line:#DCE7E8;background:#F3F7F8}.groupTopbar{border-color:#DCE7E8}.groupBrand>span,.scoreLaunch,.generateGroup{background:#3A9189!important}.groupMain{width:min(1680px,calc(100% - 48px));height:calc(100vh - 58px);display:grid;grid-template-columns:minmax(0,42fr) minmax(0,58fr);gap:20px;padding:18px 0 22px;overflow:hidden}.courseWorkspace,.studentWorkspace{height:100%;min-height:0;border:1px solid #DCE7E8;border-radius:14px;background:#fff;box-shadow:0 6px 20px rgba(36,67,75,.06)}.courseWorkspace{overflow-y:auto;scrollbar-width:thin;scrollbar-color:#C5D5D8 transparent}.courseOverview{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid #E5EDEE}.courseOverview>div>span{color:#3A9189;font-size:11px;font-weight:800}.courseOverview h1{margin:5px 0 4px;color:#18343E;font-size:24px}.courseOverview p{margin:0;color:#647C86;font-size:12px}.overviewStats{display:flex;gap:8px}.overviewStats b{min-width:66px;padding:9px 8px;border-radius:8px;background:#F8FBFB;color:#18343E;text-align:center;font-size:15px}.overviewStats small{display:block;margin-top:3px;color:#8799A0;font-size:10px;font-weight:600}.workspaceSection{padding:18px 22px;border-bottom:1px solid #E5EDEE}.workspaceSection:last-child{border-bottom:0}.workspaceTitle{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.workspaceTitle h2,.studentHeading h2{margin:0;font-size:17px}.workspaceTitle p,.studentHeading p{margin:3px 0 0;color:#8799A0;font-size:11px}.leftInfoGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.classPicker{grid-column:1/-1}.classNotes{min-height:120px;background:#FBFDFD}.generateRow .generateGroup{min-width:164px}.resultTabs{overflow-x:auto}.resultTabs button{flex:0 0 auto;padding:9px 10px;font-size:12px}.resultTabs button.active{border-color:#3A9189;color:#2E766F}.tabResultEditor{min-height:126px;background:#F8FBFB}.studentWorkspace{display:flex;flex-direction:column;overflow:hidden}.studentWorkspaceHeader{flex:0 0 auto;padding:18px 20px 14px;border-bottom:1px solid #DCE7E8}.studentHeading{display:flex;align-items:center;justify-content:space-between;gap:12px}.studentActions{margin-top:12px}.studentActions label{flex:1;background:#FBFDFD}.studentActions label input{width:100%}.studentActions .scoreLaunch,.secondaryAdd{white-space:nowrap}.completion{margin-left:auto!important}.completion i span{background:#3A9189}.studentCardList{flex:1;min-height:0;overflow-y:auto;padding:12px;scrollbar-width:thin;scrollbar-color:#C5D5D8 transparent}.studentCardList::-webkit-scrollbar,.courseWorkspace::-webkit-scrollbar{width:6px}.studentCardList::-webkit-scrollbar-thumb,.courseWorkspace::-webkit-scrollbar-thumb{border-radius:99px;background:#C5D5D8}.studentRecordCard{position:relative;min-height:114px;margin-bottom:10px;padding:13px 15px;border:1px solid #DCE7E8;border-radius:10px;background:#fff;transition:150ms ease}.studentRecordCard:nth-child(even){background:#F8FBFB}.studentRecordCard:hover{background:#F1F8F7}.studentRecordCard.editing{border-color:#9BCBC5;background:#EDF7F5;box-shadow:inset 3px 0 #3A9189}.studentCardTop{display:flex;align-items:center;gap:10px;min-height:30px}.studentIndex{width:28px;color:#8799A0;font-size:11px}.studentFullName{width:88px;border:0;background:transparent;color:#18343E;font-size:14px;font-weight:700;outline:none}.studentCardTop .moreCell{margin-left:auto}.studentCardBottom{display:grid;grid-template-columns:minmax(0,1fr) 88px;align-items:center;gap:12px;margin-top:11px}.studentCardBottom .quickInput{height:36px;background:#FBFDFD}.studentCardBottom .scoreCell{width:88px}.studentDone{position:absolute;right:10px;top:7px;color:#3A9189}.studentWorkspace>.addStudentRow{flex:0 0 54px;padding:0 14px;border-top:1px solid #DCE7E8}.studentWorkspace>.addStudentRow input{width:180px}.miniSegment.attendance .state-0.active,.miniSegment.homework .state-0.active{border:1px solid #B9DDD3;color:#287A68;background:#E8F4F0}.miniSegment .state-1.active{border:1px solid #DFCFB4;color:#8B6B3F;background:#F6F0E6}.miniSegment .state-2.active{border:1px solid #E7C2C7;color:#A85861;background:#F8EBED}.miniSegment button:not(.active){border:1px solid transparent;color:#7C8D95;background:transparent}.groupField input:focus,.groupField select:focus,.quickInput:focus,.classNotes:focus,.tabResultEditor:focus{border-color:#86BEB8;box-shadow:0 0 0 2px rgba(134,190,184,.16)}
  .classNotes,.tabResultEditor{font-size:14px;line-height:1.55}.classManager{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px}.classManager>div{display:flex;gap:6px}.classManager>div button,.excelDownload{height:38px;display:flex;align-items:center;gap:5px;border:1px solid #C8DADA;border-radius:8px;background:#fff;color:#2E766F;padding:0 10px;font-weight:700;white-space:nowrap;cursor:pointer}.classManager>div .classDelete{border-color:#E5CDD0;color:#A85861}.excelDownload{height:41px;border-color:#9BCBC5}.classDialogOverlay{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px;background:rgba(24,52,62,.5);backdrop-filter:blur(5px)}.classDialog{width:min(540px,100%);padding:22px;border-radius:14px;background:#fff;box-shadow:0 22px 60px rgba(24,52,62,.22)}.classDialog>header{display:flex;align-items:flex-start;justify-content:space-between}.classDialog h2{margin:0;color:#18343E;font-size:20px}.classDialog p{margin:6px 0 0;color:#647C86;line-height:1.6}.classDialog>header>button{border:0;background:transparent;color:#8799A0;cursor:pointer}.classDialogGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.classDialog footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}.classDialog footer button{height:38px;border:1px solid #DCE7E8;border-radius:8px;background:#fff;color:#647C86;padding:0 15px;font-weight:700;cursor:pointer}.classDialog footer .primaryDialogAction{border-color:#3A9189;background:#3A9189;color:#fff}.dangerDialog{text-align:center}.dangerIcon{width:58px;height:58px;display:grid;place-items:center;margin:0 auto 15px;border-radius:50%;background:#F8EBED;color:#A85861}.dangerDialog p{margin-top:10px}.onlyClassWarning{margin-top:14px;border-radius:8px;background:#F6F0E6;color:#8B6B3F;padding:10px;font-size:12px}.classDialog footer .dangerDialogAction{border-color:#A85861;background:#A85861;color:#fff}.classDialog footer .dangerDialogAction:disabled{opacity:.4;cursor:not-allowed}
  .groupApiError{margin-top:8px;border-radius:7px;background:#F8EBED;color:#A85861;padding:8px 10px;font-size:12px}
  .generateGroup:disabled{opacity:.55;cursor:wait}
  .classDelete:disabled,.excelDownload:disabled,.addStudentRow button:disabled,.addStudentRow input:disabled{opacity:.45;cursor:not-allowed}
  .teacherPicker{position:relative;justify-self:end}.teacherPicker .teacherSwitch{min-width:132px;justify-content:flex-start}.teacherSwitch b{font-size:12px}.teacherSwitch svg{margin-left:auto;transition:transform 160ms}.teacherSwitch svg.open{transform:rotate(180deg)}.teacherMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:80;width:190px;padding:6px;border:1px solid #DCE7E8;border-radius:12px;background:#fff;box-shadow:0 14px 36px rgba(24,52,62,.16)}.teacherMenu>button{width:100%;display:grid;grid-template-columns:32px 1fr 18px;align-items:center;gap:9px;border:0;border-radius:8px;background:transparent;color:#18343E;padding:8px;text-align:left;cursor:pointer}.teacherMenu>button:hover{background:#F3F8F8}.teacherMenu>button.active{background:#EAF5F3}.teacherMenu>button>span{width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:#E7F3F1;color:#2E766F;font-size:12px;font-weight:800}.teacherMenu>button div{display:grid;gap:2px}.teacherMenu>button b{font-size:13px}.teacherMenu>button small{color:#8799A0;font-size:10px}.teacherMenu>button>svg{color:#3A9189}.emptyTeacherState{min-height:320px;display:grid;place-content:center;justify-items:center;padding:34px;text-align:center}.emptyTeacherState>span{width:52px;height:52px;display:grid;place-items:center;border-radius:14px;background:#E7F3F1;color:#3A9189}.emptyTeacherState h3{margin:15px 0 6px;color:#18343E;font-size:17px}.emptyTeacherState p{max-width:330px;margin:0;color:#7A9098;font-size:12px;line-height:1.7}.emptyTeacherState button{display:flex;align-items:center;gap:6px;margin-top:18px;border:0;border-radius:8px;background:#3A9189;color:#fff;padding:10px 15px;font-weight:800;cursor:pointer}
  @media(max-width:1100px){.groupMain{height:auto;grid-template-columns:1fr;overflow:visible}.courseWorkspace{max-height:none}.studentWorkspace{height:720px}.studentCardTop{flex-wrap:wrap}}
  @media(max-width:900px){.studentActions{width:100%;flex-wrap:wrap}.groupMain{width:min(100% - 20px,1200px)}.overviewStats{display:none}}
`;
