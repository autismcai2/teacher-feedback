import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, MoreHorizontal, Plus, Search, Sparkles, X } from "lucide-react";

const seedStudents = ["陈志祥", "郑力萌", "蔡致远", "张梦晓", "闫浩宇", "关照"];
const commentSeeds = [
  "课堂专注，能够认真跟进讲解思路",
  "学习态度认真，练习过程较为踏实",
  "课堂投入度较好，能够积极配合教学安排",
  "思维状态活跃，对重点内容反应较快",
  "听课认真，能够及时完成课堂练习",
  "课堂表现稳定，知识点跟进较为顺畅",
];

function makeStudent(name, index) {
  return { id: `${Date.now()}-${index}`, name, attendance: "出席", homeworkStatus: "已完成", quickNote: "", score: "" };
}

export default function GroupClassWorkspace({ onBack }) {
  const [students, setStudents] = useState(() => seedStudents.map(makeStudent));
  const [classInfo, setClassInfo] = useState({ title: "2026年夏季班", grade: "初三", subject: "数学", date: new Date().toISOString().slice(0, 10), time: "13:10-15:10", lesson: "1" });
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
  const [results, setResults] = useState({ teachingContent: "", difficultPoints: "", absorption: "", homework: "" });

  const attendedStudents = useMemo(() => students.filter((student) => student.attendance === "出席"), [students]);
  const scoredCount = students.filter((student) => student.score !== "").length;
  const currentStudent = students[scoreIndex];
  const filteredStudents = students.filter((student) => student.name.includes(search.trim()));
  const resultTabs = [
    ["teachingContent", "本节课教学内容"],
    ["difficultPoints", "本节课重难点"],
    ["absorption", "学生吸收情况"],
    ["homework", "作业"],
  ];

  function updateClassInfo(key, value) {
    setClassInfo((previous) => ({ ...previous, [key]: value }));
  }

  function updateStudent(id, patch) {
    setStudents((previous) => previous.map((student) => (student.id === id ? { ...student, ...patch } : student)));
  }

  function addStudent() {
    const name = newStudent.trim();
    if (!name || students.some((student) => student.name === name)) return;
    setStudents((previous) => [...previous, makeStudent(name, previous.length)]);
    setNewStudent("");
  }

  function removeStudent(id) {
    setStudents((previous) => previous.filter((student) => student.id !== id));
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

  function generateDraft() {
    setStudents((previous) => previous.map((student, index) => ({
      ...student,
      quickNote: student.quickNote.trim() || commentSeeds[index % commentSeeds.length],
    })));
    setResults({
      teachingContent: rawText.trim() || "请填写课堂记录，AI生成后将在这里呈现本节课的教学内容。",
      difficultPoints: "围绕本节核心知识梳理方法，并结合典型题型辨析易错点。",
      absorption: `本节课共${attendedStudents.length}名学生出席，整体能够跟进课堂节奏。后续需结合入门测结果继续进行分层巩固。`,
      homework: "完成教材对应练习，订正课堂错题并整理本节知识要点。",
    });
  }

  const rangeScores = scoreRange === 20
    ? Array.from({ length: 11 }, (_, index) => index + 20)
    : Array.from({ length: 10 }, (_, index) => index + scoreRange);

  return (
    <div className="groupShell">
      <header className="groupTopbar">
        <button className="backButton" type="button" onClick={onBack}><ArrowLeft size={18} />课程类型</button>
        <div className="groupBrand"><span>班</span><div><b>班级反馈工作台</b><small>CLASS FEEDBACK</small></div></div>
        <button className="teacherSwitch" type="button"><span>陈</span><b>陈老师</b><ChevronDown size={15} /></button>
      </header>

      <main className="groupMain">
        <section className="classHero">
          <div><span className="bluePill">当前班级</span><h1>{classInfo.title} · {classInfo.grade}{classInfo.subject}</h1><p>上课时间：{classInfo.date} <span>{classInfo.time}</span></p></div>
          <div className="heroStats"><div><b>{students.length}</b><span>班级学员</span></div><div><b>{scoredCount}</b><span>已完成</span></div><div><b>第 {classInfo.lesson} 次</b><span>当前课次</span></div></div>
        </section>

        <section className="groupCard classSettings">
          <div className="sectionHeading compactHeading"><div><div><h2>本节课信息</h2><p>公共信息将同步写入班级反馈模板</p></div></div></div>
          <div className="classInfoGrid">
            <Field label="班级名称" value={classInfo.title} onChange={(value) => updateClassInfo("title", value)} />
            <Field label="年级" value={classInfo.grade} onChange={(value) => updateClassInfo("grade", value)} />
            <Field label="科目" value={classInfo.subject} onChange={(value) => updateClassInfo("subject", value)} />
            <Field label="上课日期" type="date" value={classInfo.date} onChange={(value) => updateClassInfo("date", value)} />
            <Field label="上课时间" value={classInfo.time} onChange={(value) => updateClassInfo("time", value)} />
            <Field label="课次" type="number" value={classInfo.lesson} onChange={(value) => updateClassInfo("lesson", value)} />
          </div>
        </section>

        <section className="groupCard">
          <div className="sectionHeading compactHeading"><div><div><h2>课堂记录与反馈生成</h2><p>记录本节内容、重点和整体课堂情况</p></div></div><div className="saveState"><Check size={15} />自动保存</div></div>
          <textarea className="classNotes" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：本节课学习一元二次方程的概念、开平方法和配方法；重点练习二次三项式最值问题……" />
          <div className="generateRow"><button className="generateGroup" type="button" onClick={generateDraft}><Sparkles size={18} />生成班级反馈</button><span>AI将结合学生记录生成差异化反馈</span></div>
          <div className="resultTabs">{resultTabs.map(([key, label]) => <button className={activeResult === key ? "active" : ""} type="button" key={key} onClick={() => setActiveResult(key)}>{label}</button>)}</div>
          <textarea className="tabResultEditor" value={results[activeResult]} onChange={(event) => setResults((previous) => ({ ...previous, [activeResult]: event.target.value }))} placeholder="生成后可在这里继续编辑" />
        </section>

        <section className="groupCard studentManagement">
          <div className="sectionHeading">
            <div><div><h2>学生课堂记录</h2><p>记录可留空，生成时自动补充自然且不重复的点评</p></div><div className="completion"><b>已完成 {scoredCount}/{students.length}</b><i><span style={{ width: `${students.length ? (scoredCount / students.length) * 100 : 0}%` }} /></i></div></div>
            <div className="studentActions"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索学生" /></label><button className="scoreLaunch" type="button" disabled={!students.length} onClick={() => openRecorder()}><ClipboardCheck size={16} />快速录分</button><button className="secondaryAdd" type="button" onClick={() => document.querySelector('.addStudentRow input')?.focus()}><Plus size={16} />添加学生</button></div>
          </div>

          <div className="studentTableWrap">
            <table className="studentTable">
              <thead><tr><th>序号</th><th>学生姓名</th><th>出勤状态</th><th>作业情况</th><th>学生课堂记录</th><th>入门测试</th><th>操作</th></tr></thead>
              <tbody>{filteredStudents.map((student) => {
                const index = students.findIndex((item) => item.id === student.id);
                return (
                <tr key={student.id}>
                  <td className="rowNumber">{String(index + 1).padStart(2, "0")}</td>
                  <td><div className="studentName"><input value={student.name} onChange={(event) => updateStudent(student.id, { name: event.target.value })} /></div></td>
                  <td><MiniSegment kind="attendance" value={student.attendance} options={["出席", "请假", "缺席"]} onChange={(attendance) => updateStudent(student.id, { attendance })} /></td>
                  <td><MiniSegment kind="homework" value={student.homeworkStatus} options={["已完成", "部分", "未完成"]} onChange={(homeworkStatus) => updateStudent(student.id, { homeworkStatus })} /></td>
                  <td><input className="quickInput" value={student.quickNote} onChange={(event) => updateStudent(student.id, { quickNote: event.target.value })} placeholder="可留空，由AI自动生成" /></td>
                  <td><button className={`scoreCell ${student.score !== "" ? "filled" : ""}`} type="button" onClick={() => openRecorder(index)}>{student.score === "" ? "录入" : student.score === "缺考" ? "缺考" : `${student.score} / 30`}</button></td>
                  <td className="moreCell"><button className="moreButton" type="button" onClick={() => setMenuStudent(menuStudent === student.id ? "" : student.id)}><MoreHorizontal size={18} /></button>{menuStudent === student.id && <div className="rowMenu"><button type="button" onClick={() => { removeStudent(student.id); setMenuStudent(""); }}>删除学生</button></div>}</td>
                </tr>
              )})}</tbody>
            </table>
          </div>
          <div className="addStudentRow"><span>{students.length} 名学生 · 表格支持内部滚动</span><div><input value={newStudent} onChange={(event) => setNewStudent(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addStudent()} placeholder="输入新学员姓名" /><button type="button" onClick={addStudent}><Plus size={15} />添加</button></div></div>
        </section>
      </main>

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

function Field({ label, value, onChange, type = "text" }) {
  return <label className="groupField"><span>{label}</span><input type={type} min={type === "number" ? "1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MiniSegment({ value, options, onChange, kind }) {
  return <div className={`miniSegment ${kind}`}>{options.map((option, index) => <button className={`state-${index} ${value === option ? "active" : ""}`} key={option} type="button" onClick={() => onChange(option)}>{option}</button>)}</div>;
}

const groupCss = `
  .groupShell{--baby:#dff3ff;--maldives:#43bccb;--deep:#397f98;--morandi:#7399aa;--ink:#254454;--muted:#6b8795;--line:#cfe1e8;min-height:100vh;background:#f2f8fa;color:var(--ink);font-family:Inter,"Microsoft YaHei",sans-serif}.groupShell *{box-sizing:border-box}.groupTopbar{height:72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 32px;background:rgba(250,253,254,.92);border-bottom:1px solid #dce9ed;position:sticky;top:0;z-index:20;backdrop-filter:blur(16px)}.backButton{justify-self:start;display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#587786;font-weight:800;cursor:pointer}.groupBrand{display:flex;align-items:center;gap:11px}.groupBrand>span{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#79d7e2,#40b5c7);color:#fff;font-weight:900}.groupBrand div{display:grid}.groupBrand b{font-size:15px}.groupBrand small{font-size:10px;color:#84a0ad;text-transform:uppercase;letter-spacing:.12em}.saveState{justify-self:end;display:flex;align-items:center;gap:6px;color:#668792;font-size:12px}.groupMain{width:min(1380px,calc(100% - 40px));margin:0 auto;padding:28px 0 70px}.classHero{min-height:190px;display:flex;justify-content:space-between;align-items:center;gap:30px;padding:34px 40px;margin-bottom:20px;border-radius:28px;background:linear-gradient(125deg,#dff3ff 0%,#caedf4 48%,#a9dce5 100%);box-shadow:0 18px 45px rgba(65,120,140,.12)}.bluePill{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.65);color:#43889b;font-size:11px;font-weight:900}.classHero h1{margin:13px 0 7px;font-size:clamp(27px,3vw,40px);letter-spacing:-.035em}.classHero p{margin:0;color:#5d8191}.heroStats{display:flex;gap:10px}.heroStats div{min-width:104px;padding:18px;border:1px solid rgba(255,255,255,.62);border-radius:19px;background:rgba(255,255,255,.48);text-align:center}.heroStats b,.heroStats span{display:block}.heroStats b{font-size:20px}.heroStats span{margin-top:5px;color:#648594;font-size:11px}.groupCard{margin-bottom:20px;padding:26px;border:1px solid #dce9ed;border-radius:23px;background:#fff;box-shadow:0 10px 30px rgba(50,91,109,.06)}.sectionHeading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.sectionHeading>div{display:flex;align-items:center;gap:12px}.sectionHeading h2,.sectionHeading p{margin:0}.sectionHeading h2{font-size:19px}.sectionHeading p{margin-top:4px;color:#8098a3;font-size:12px}.stepBadge{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:var(--baby);color:#3f93a8;font-size:12px;font-weight:900}.classInfoGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px}.groupField{display:grid;gap:7px}.groupField span{color:#617e8c;font-size:12px;font-weight:800}.groupField input,.addStudentRow input,.quickInput{width:100%;border:1px solid var(--line);border-radius:11px;background:#fbfdfe;color:var(--ink);padding:11px 12px;outline:none}.groupField input:focus,.addStudentRow input:focus,.quickInput:focus,.classNotes:focus,.resultCard textarea:focus{border-color:var(--maldives);box-shadow:0 0 0 3px rgba(67,188,203,.12)}.scoreLaunch{display:flex;align-items:center;gap:8px;border:0;border-radius:12px;background:#3eaec0;color:#fff;padding:11px 14px;font-weight:800;cursor:pointer}.scoreLaunch span{padding:3px 7px;border-radius:99px;background:rgba(255,255,255,.18);font-size:11px}.studentTableWrap{overflow-x:auto}.studentTable{width:100%;border-collapse:collapse;min-width:1060px}.studentTable th{padding:10px;color:#78909b;font-size:11px;text-align:left;border-bottom:1px solid #dce8ec}.studentTable td{padding:10px 7px;border-bottom:1px solid #edf3f5}.studentName{display:flex;align-items:center;gap:9px}.studentName>span{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:#e8f6fa;color:#4a91a2;font-size:11px;font-weight:900}.studentName input{width:92px;border:0;background:transparent;color:var(--ink);font-weight:800;outline:none}.miniSegment{display:flex;padding:3px;border-radius:10px;background:#eef5f7}.miniSegment button{border:0;border-radius:8px;background:transparent;color:#78909b;padding:7px 9px;font-size:11px;cursor:pointer;white-space:nowrap}.miniSegment button.active{background:#fff;color:#367f93;font-weight:900;box-shadow:0 2px 8px rgba(55,95,110,.1)}.scoreCell{min-width:72px;border:1px dashed #9fc8d2;border-radius:10px;background:#f3fbfc;color:#4d91a2;padding:9px;cursor:pointer;font-weight:800}.scoreCell.filled{border-style:solid;background:#dff5f6;color:#287d8e}.removeStudent{border:0;background:transparent;color:#a5b6be;cursor:pointer}.addStudentRow{display:flex;gap:9px;margin-top:16px}.addStudentRow input{max-width:230px}.addStudentRow button{border:0;border-radius:11px;background:#e1f2f6;color:#3b8295;padding:0 15px;font-weight:800;cursor:pointer}.classNotes{width:100%;min-height:160px;resize:vertical;border:1px solid var(--line);border-radius:15px;background:#fbfdfe;padding:16px;color:var(--ink);font:inherit;line-height:1.7;outline:none}.generateGroup{width:100%;display:flex;justify-content:center;align-items:center;gap:9px;margin-top:13px;border:0;border-radius:13px;background:linear-gradient(100deg,#4fc1cd,#3b9eb5);color:#fff;padding:14px;font-weight:900;cursor:pointer;box-shadow:0 9px 22px rgba(60,165,182,.2)}.resultGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.resultCard{overflow:hidden;border:1px solid #dce8ec;border-radius:20px;background:#fff}.resultCard header{padding:15px 19px;font-size:17px}.resultCard textarea{width:100%;min-height:150px;border:0;border-top:1px solid #e8f0f2;padding:17px;resize:vertical;color:var(--ink);font:inherit;line-height:1.65;outline:none}.resultCard.pink header{background:#f4d5db}.resultCard.aqua header{background:#bdeae8}.resultCard.green header{background:#cbe8b8}.resultCard.yellow header{background:#f8e7a8}.scoreOverlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(27,53,65,.58);backdrop-filter:blur(8px)}.overlayDismiss{position:absolute;right:25px;top:22px;border:0;background:transparent;color:#fff;cursor:pointer}.scoreRecorder{width:min(620px,100%);border-radius:28px;background:#f9fdfe;box-shadow:0 30px 90px rgba(14,42,55,.35);overflow:hidden}.recorderHeader{padding:28px 30px 20px;background:linear-gradient(125deg,#dff3ff,#b9e7ef)}.recorderHeader span{color:#4a8ea1;font-size:11px;font-weight:900;letter-spacing:.1em}.recorderHeader h2{margin:7px 0 2px;font-size:31px}.recorderHeader p{margin:0;color:#6b8997;font-size:13px}.scoreProgress{height:5px;margin-top:20px;border-radius:99px;background:rgba(255,255,255,.7);overflow:hidden}.scoreProgress i{display:block;height:100%;border-radius:inherit;background:#3aaabd;transition:width .2s}.recorderModes{display:grid;grid-template-columns:1fr 1fr;margin:20px 28px 0;padding:4px;border-radius:12px;background:#eaf3f6}.recorderModes button,.rangeTabs button{border:0;border-radius:9px;background:transparent;color:#78929e;padding:10px;font-weight:800;cursor:pointer}.recorderModes button.active,.rangeTabs button.active{background:#fff;color:#35869a;box-shadow:0 3px 10px rgba(60,95,110,.1)}.rangeTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:18px 28px 0}.scoreButtons{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:20px 28px 8px}.scoreButtons button{aspect-ratio:1;border:1px solid #cae2e8;border-radius:15px;background:#fff;color:#31596a;font-size:18px;font-weight:900;cursor:pointer;transition:.15s}.scoreButtons button:hover{transform:translateY(-2px);border-color:#43bccc;background:#dff5f7;color:#237d8f}.autoHint{text-align:center;color:#88a0aa;font-size:12px}.typeScore{display:grid;justify-items:center;padding:34px 28px 23px}.typeScore label{display:flex;align-items:baseline;gap:12px}.typeScore input{width:150px;border:0;border-bottom:3px solid #76c9d5;background:transparent;color:#285365;font-size:58px;font-weight:900;text-align:center;outline:none}.typeScore label span{color:#78929e;font-size:20px}.typeScore>button{margin-top:25px;border:0;border-radius:12px;background:#3aaabc;color:#fff;padding:12px 22px;font-weight:900;cursor:pointer}.typeScore p{color:#8da2ab;font-size:12px}.recorderFooter{display:grid;grid-template-columns:100px 1fr 100px;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid #e2edf0}.recorderFooter>button{display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#648390;font-weight:800;cursor:pointer}.recorderFooter>button:disabled{opacity:.3}.recorderFooter>div{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}.recorderFooter>div button{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:#d2e0e5;cursor:pointer}.recorderFooter>div button.done{background:#70c9d3}.recorderFooter>div button.current{outline:3px solid rgba(65,181,198,.2);background:#2e99ad}.scoreLaunch:disabled{opacity:.45;cursor:not-allowed}@media(max-width:1050px){.classInfoGrid{grid-template-columns:repeat(3,1fr)}.classHero{align-items:flex-start;flex-direction:column}.heroStats{width:100%}.heroStats div{flex:1}.resultGrid{grid-template-columns:1fr}}@media(max-width:680px){.groupTopbar{grid-template-columns:auto 1fr;height:62px;padding:0 15px}.groupBrand{justify-self:end}.saveState{display:none}.groupMain{width:min(100% - 22px,1380px);padding-top:12px}.classHero{padding:24px;border-radius:21px}.heroStats{overflow-x:auto}.heroStats div{min-width:90px}.groupCard{padding:18px;border-radius:18px}.sectionHeading{align-items:flex-start;flex-direction:column}.scoreLaunch{width:100%;justify-content:center}.classInfoGrid{grid-template-columns:repeat(2,1fr)}.scoreButtons{grid-template-columns:repeat(4,1fr)}.recorderFooter{grid-template-columns:75px 1fr 75px;padding:14px 10px}.groupBrand small{display:none}}
  /* Dense desktop workspace v2 */
  .groupShell{background:#f4f8fa}.groupTopbar{height:58px;grid-template-columns:1fr auto 1fr;padding:0 24px}.groupBrand{justify-self:center}.groupBrand>span{width:32px;height:32px;border-radius:10px}.teacherSwitch{justify-self:end;display:flex;align-items:center;gap:8px;border:1px solid #dbe7eb;border-radius:10px;background:#fff;color:#486674;padding:6px 9px;cursor:pointer}.teacherSwitch>span{width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#dff3f7;color:#2f8799;font-weight:900}.teacherSwitch b{font-size:12px}.groupMain{width:min(1200px,calc(100% - 32px));padding:18px 0 42px}.classHero{min-height:118px;padding:22px 26px;margin-bottom:14px;border:1px solid #dce9ed;border-radius:15px;background:#fff;box-shadow:0 6px 20px rgba(41,76,92,.05)}.bluePill{padding:4px 8px;background:#e6f5f8;font-size:10px}.classHero h1{margin:8px 0 5px;font-size:25px}.classHero p{font-size:12px}.heroStats div{min-width:112px;padding:12px 16px;border-color:#deeaee;border-radius:12px;background:#f8fbfc}.heroStats b{font-size:18px}.groupCard{margin-bottom:14px;padding:18px 20px;border-radius:15px;box-shadow:0 4px 16px rgba(42,77,93,.045)}.sectionHeading{margin-bottom:14px}.compactHeading h2,.sectionHeading h2{font-size:16px}.classInfoGrid{gap:10px}.groupField{gap:5px}.groupField input{height:38px;border-radius:8px;padding:8px 10px}.classNotes{min-height:118px;border-radius:10px;padding:12px 14px}.generateRow{display:flex;align-items:center;gap:14px;margin-top:10px}.generateRow .generateGroup{width:auto;min-width:190px;margin:0;padding:11px 18px;border-radius:9px}.generateRow>span{color:#8aa0aa;font-size:11px}.resultTabs{display:flex;gap:4px;margin-top:16px;border-bottom:1px solid #dce7eb}.resultTabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:#718b96;padding:10px 16px;font-weight:700;cursor:pointer}.resultTabs button.active{border-bottom-color:#35a9ba;color:#267f90}.tabResultEditor{width:100%;min-height:100px;border:0;background:#fbfdfe;color:var(--ink);padding:13px 14px;resize:vertical;font:inherit;line-height:1.6;outline:none}.studentManagement{padding-bottom:0}.studentActions{display:flex;align-items:center;gap:8px}.studentActions label{height:36px;display:flex;align-items:center;gap:6px;border:1px solid #d6e4e8;border-radius:9px;padding:0 9px;color:#76909b}.studentActions label input{width:110px;border:0;outline:none;color:var(--ink)}.studentActions .scoreLaunch,.secondaryAdd{height:36px;border-radius:9px;padding:0 12px}.secondaryAdd{display:flex;align-items:center;gap:5px;border:1px solid #cddfe4;background:#fff;color:#467686;font-weight:800;cursor:pointer}.completion{display:flex!important;align-items:center!important;gap:9px!important;margin-left:14px}.completion b{color:#587886;font-size:11px}.completion i{width:90px;height:5px;border-radius:99px;background:#e8f0f3;overflow:hidden}.completion i span{display:block;height:100%;background:#42b6c5}.studentTableWrap{height:388px;overflow:auto;border-top:1px solid #e3ecef;border-bottom:1px solid #e3ecef;scrollbar-width:thin;scrollbar-color:#bfd2d9 transparent}.studentTableWrap::-webkit-scrollbar{width:6px;height:6px}.studentTableWrap::-webkit-scrollbar-thumb{border-radius:99px;background:#bfd2d9}.studentTable thead{position:sticky;top:0;z-index:3;background:#f7fafb}.studentTable th{height:38px;padding:8px 7px}.studentTable tbody tr{height:55px;transition:background .15s}.studentTable tbody tr:hover{background:#f2fafc}.studentTable td{padding:7px}.rowNumber{width:48px;color:#91a5ad;font-size:11px}.studentName>span{width:28px;height:28px;border-radius:50%}.studentName input{width:76px}.miniSegment{padding:2px;border:1px solid #e0eaed;border-radius:8px;background:#fff}.miniSegment button{border-radius:6px;padding:6px 7px}.miniSegment button.active{background:#e4f4f7;box-shadow:none}.quickInput{height:34px;border-radius:8px;padding:7px 9px}.scoreCell{border-style:solid;border-radius:8px;background:#fff;padding:7px 9px}.scoreCell.filled{background:#e6f6f8}.moreCell{position:relative}.moreButton{border:0;background:transparent;color:#7e969f;cursor:pointer}.rowMenu{position:absolute;right:24px;top:40px;z-index:8;padding:5px;border:1px solid #dce7ea;border-radius:8px;background:#fff;box-shadow:0 8px 22px rgba(30,60,75,.14)}.rowMenu button{border:0;background:transparent;color:#b04c58;padding:7px 12px;white-space:nowrap;cursor:pointer}.addStudentRow{position:sticky;bottom:0;min-height:54px;display:flex;align-items:center;justify-content:space-between;margin:0;background:#fff}.addStudentRow>span{color:#849aa4;font-size:11px}.addStudentRow>div{display:flex;gap:7px}.addStudentRow input{height:34px;max-width:190px;border-radius:8px}.addStudentRow button{height:34px;display:flex;align-items:center;gap:4px;border-radius:8px}.scoreRecorder{width:min(580px,100%);border-radius:16px}.recorderHeader{padding:22px 26px 17px;background:#f3fafc}.recorderHeader h2{font-size:25px}.recorderModes{margin-top:15px}.scoreButtons{gap:8px}.scoreButtons button{border-radius:10px}.scoreButtons button.selected{border-color:#2c9fb1;background:#35aabc;color:#fff}.absentRow{display:flex;align-items:center;justify-content:center;gap:14px;margin:4px 28px 14px}.absentRow>button{border:1px solid #c8d9de;border-radius:8px;background:#fff;color:#6d8792;padding:7px 18px;font-weight:800;cursor:pointer}.autoHint{margin:0}.recorderFooter{padding:13px 20px}
  .studentTable th:nth-child(1){width:48px}.studentTable th:nth-child(2){width:105px}.studentTable th:nth-child(3){width:166px}.studentTable th:nth-child(4){width:192px}.studentTable th:nth-child(6){width:92px}.studentTable th:nth-child(7){width:52px}.studentName{display:block}.studentName input{width:82px}.miniSegment{display:inline-flex;width:max-content;padding:2px;gap:2px;border:0;background:#f3f5f6}.miniSegment button{font-weight:700}.miniSegment button:not(.active){color:#7c8d95;background:transparent}.miniSegment .state-0.active{color:#1f684a;background:#E7F7EF}.miniSegment .state-1.active{color:#8b5c10;background:#FFF3D6}.miniSegment .state-2.active{color:#963b45;background:#FDEBEC}.addStudentRow button{white-space:nowrap;flex-shrink:0}.typeScore{min-height:190px}.typeScore p{margin-top:18px}.typeScore em{color:#b3434c;font-size:12px;font-style:normal}.scoreComplete{display:grid;justify-items:center;padding:46px 30px}.scoreComplete>span{width:58px;height:58px;display:grid;place-items:center;border-radius:50%;background:#e2f6f0;color:#27805f}.scoreComplete h2{margin:17px 0 5px}.scoreComplete p{margin:0;color:#7a929d}.scoreComplete button{margin-top:24px;border:0;border-radius:9px;background:#35aabc;color:#fff;padding:11px 18px;font-weight:800;cursor:pointer}.savedToast{position:absolute;left:50%;bottom:24px;display:flex;align-items:center;gap:7px;transform:translateX(-50%);border-radius:9px;background:#244f5e;color:#fff;padding:9px 13px;font-size:12px;box-shadow:0 8px 24px rgba(20,50,65,.22);pointer-events:none}.scoreButtons button{transition:none}
  @media(max-width:900px){.studentActions{width:100%;flex-wrap:wrap}.studentTableWrap{height:380px}.groupMain{width:min(100% - 20px,1200px)}}
`;
