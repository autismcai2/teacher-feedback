import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ClipboardCheck, Sparkles, X } from "lucide-react";

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
  const [results, setResults] = useState({ teachingContent: "", difficultPoints: "", absorption: "", homework: "" });

  const attendedStudents = useMemo(() => students.filter((student) => student.attendance === "出席"), [students]);
  const scoredCount = students.filter((student) => student.score !== "").length;
  const currentStudent = students[scoreIndex];

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
    setScoreOpen(true);
  }

  function moveScore(direction) {
    if (!students.length) return;
    setScoreIndex((previous) => Math.min(Math.max(previous + direction, 0), students.length - 1));
    setTypedScore("");
  }

  function saveScore(value) {
    const score = Number(value);
    if (!currentStudent || !Number.isInteger(score) || score < 0 || score > 30) return;
    updateStudent(currentStudent.id, { score: String(score) });
    setTypedScore("");
    if (scoreIndex < students.length - 1) setScoreIndex((previous) => previous + 1);
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
        <div className="groupBrand"><span>班课</span><div><b>班课反馈工作台</b><small>Group class feedback</small></div></div>
        <div className="saveState"><Check size={15} />内容实时保留</div>
      </header>

      <main className="groupMain">
        <section className="classHero">
          <div><span className="bluePill">宝宝蓝 · 马尔代夫蓝 · 莫兰迪蓝</span><h1>{classInfo.title} · {classInfo.grade}{classInfo.subject}</h1><p>一次整理整班课堂记录，逐位录入表现与成绩。</p></div>
          <div className="heroStats"><div><b>{students.length}</b><span>班级学员</span></div><div><b>{scoredCount}</b><span>已录成绩</span></div><div><b>第 {classInfo.lesson} 次</b><span>当前课次</span></div></div>
        </section>

        <section className="groupCard classSettings">
          <div className="sectionHeading"><div><span className="stepBadge">01</span><div><h2>本节班课</h2><p>公共信息会同步写入反馈模板</p></div></div></div>
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
          <div className="sectionHeading">
            <div><span className="stepBadge">02</span><div><h2>学员快速记录</h2><p>记录可留空，生成时会自动补充不重复的自然点评</p></div></div>
            <button className="scoreLaunch" type="button" disabled={!students.length} onClick={() => openRecorder()}><ClipboardCheck size={17} />连续录入入门测 <span>{scoredCount}/{students.length}</span></button>
          </div>

          <div className="studentTableWrap">
            <table className="studentTable">
              <thead><tr><th>学员</th><th>出席情况</th><th>作业情况</th><th>学生快速记录（选填）</th><th>入门测</th><th /></tr></thead>
              <tbody>{students.map((student, index) => (
                <tr key={student.id}>
                  <td><div className="studentName"><span>{index + 1}</span><input value={student.name} onChange={(event) => updateStudent(student.id, { name: event.target.value })} /></div></td>
                  <td><MiniSegment value={student.attendance} options={["出席", "请假", "缺席"]} onChange={(attendance) => updateStudent(student.id, { attendance })} /></td>
                  <td><MiniSegment value={student.homeworkStatus} options={["已完成", "部分", "未完成"]} onChange={(homeworkStatus) => updateStudent(student.id, { homeworkStatus })} /></td>
                  <td><input className="quickInput" value={student.quickNote} onChange={(event) => updateStudent(student.id, { quickNote: event.target.value })} placeholder="可留空，由AI自动生成" /></td>
                  <td><button className={`scoreCell ${student.score !== "" ? "filled" : ""}`} type="button" onClick={() => openRecorder(index)}>{student.score === "" ? "录分" : `${student.score} / 30`}</button></td>
                  <td><button className="removeStudent" type="button" onClick={() => removeStudent(student.id)} aria-label={`删除${student.name}`}><X size={16} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="addStudentRow"><input value={newStudent} onChange={(event) => setNewStudent(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addStudent()} placeholder="输入新学员姓名" /><button type="button" onClick={addStudent}>＋ 添加学员</button></div>
        </section>

        <section className="groupCard">
          <div className="sectionHeading"><div><span className="stepBadge">03</span><div><h2>课堂记录与生成</h2><p>写下本节内容、重难点和整体情况</p></div></div></div>
          <textarea className="classNotes" value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="例如：本节课学习一元二次方程的概念、开平方法和配方法；重点练习二次三项式最值问题……" />
          <button className="generateGroup" type="button" onClick={generateDraft}><Sparkles size={19} />生成整班反馈</button>
        </section>

        <section className="resultGrid">
          <ResultCard number="一" title="本节课教学内容" tone="pink" value={results.teachingContent} onChange={(value) => setResults((previous) => ({ ...previous, teachingContent: value }))} />
          <ResultCard number="二" title="本节课重难点" tone="aqua" value={results.difficultPoints} onChange={(value) => setResults((previous) => ({ ...previous, difficultPoints: value }))} />
          <ResultCard number="三" title="学生吸收情况" tone="green" value={results.absorption} onChange={(value) => setResults((previous) => ({ ...previous, absorption: value }))} />
          <ResultCard number="四" title="作业" tone="yellow" value={results.homework} onChange={(value) => setResults((previous) => ({ ...previous, homework: value }))} />
        </section>
      </main>

      {scoreOpen && currentStudent && (
        <div className="scoreOverlay" role="dialog" aria-modal="true" aria-label="连续录入入门测成绩">
          <button className="overlayDismiss" type="button" onClick={() => setScoreOpen(false)} aria-label="关闭录分"><X /></button>
          <section className="scoreRecorder">
            <div className="recorderHeader"><div><span>入门测连续录分</span><h2>{currentStudent.name}</h2><p>第 {scoreIndex + 1} 位，共 {students.length} 位</p></div><div className="scoreProgress"><i style={{ width: `${((scoreIndex + 1) / students.length) * 100}%` }} /></div></div>
            <div className="recorderModes"><button className={scoreMode === "pick" ? "active" : ""} type="button" onClick={() => setScoreMode("pick")}>点选分数</button><button className={scoreMode === "type" ? "active" : ""} type="button" onClick={() => setScoreMode("type")}>键盘填分</button></div>
            {scoreMode === "pick" ? <>
              <div className="rangeTabs">{[0, 10, 20].map((range) => <button className={scoreRange === range ? "active" : ""} key={range} type="button" onClick={() => setScoreRange(range)}>{range === 20 ? "20–30" : `${range}–${range + 10}`}</button>)}</div>
              <div className="scoreButtons">{rangeScores.map((score) => <button key={score} type="button" onClick={() => saveScore(score)}>{score}</button>)}</div>
              <p className="autoHint">点击分数后，将自动进入下一位学生</p>
            </> : <form className="typeScore" onSubmit={(event) => { event.preventDefault(); saveScore(typedScore); }}><label><input autoFocus inputMode="numeric" min="0" max="30" type="number" value={typedScore} onChange={(event) => setTypedScore(event.target.value)} placeholder="—" /><span>/ 30</span></label><button type="submit">确认并进入下一位</button><p>输入 0–30 的整数，按 Enter 即可继续</p></form>}
            <footer className="recorderFooter"><button type="button" disabled={scoreIndex === 0} onClick={() => moveScore(-1)}><ChevronLeft size={18} />上一位</button><div>{students.map((student, index) => <button title={student.name} aria-label={`切换到${student.name}`} className={`${index === scoreIndex ? "current" : ""} ${student.score !== "" ? "done" : ""}`} key={student.id} type="button" onClick={() => setScoreIndex(index)} />)}</div><button type="button" disabled={scoreIndex === students.length - 1} onClick={() => moveScore(1)}>跳过<ChevronRight size={18} /></button></footer>
          </section>
        </div>
      )}
      <style>{groupCss}</style>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return <label className="groupField"><span>{label}</span><input type={type} min={type === "number" ? "1" : undefined} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MiniSegment({ value, options, onChange }) {
  return <div className="miniSegment">{options.map((option) => <button className={value === option ? "active" : ""} key={option} type="button" onClick={() => onChange(option)}>{option}</button>)}</div>;
}

function ResultCard({ number, title, tone, value, onChange }) {
  return <article className={`resultCard ${tone}`}><header><b>{number}、{title}</b></header><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="AI生成后可在这里继续编辑" /></article>;
}

const groupCss = `
  .groupShell{--baby:#dff3ff;--maldives:#43bccb;--deep:#397f98;--morandi:#7399aa;--ink:#254454;--muted:#6b8795;--line:#cfe1e8;min-height:100vh;background:#f2f8fa;color:var(--ink);font-family:Inter,"Microsoft YaHei",sans-serif}.groupShell *{box-sizing:border-box}.groupTopbar{height:72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 32px;background:rgba(250,253,254,.92);border-bottom:1px solid #dce9ed;position:sticky;top:0;z-index:20;backdrop-filter:blur(16px)}.backButton{justify-self:start;display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#587786;font-weight:800;cursor:pointer}.groupBrand{display:flex;align-items:center;gap:11px}.groupBrand>span{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;background:linear-gradient(145deg,#79d7e2,#40b5c7);color:#fff;font-weight:900}.groupBrand div{display:grid}.groupBrand b{font-size:15px}.groupBrand small{font-size:10px;color:#84a0ad;text-transform:uppercase;letter-spacing:.12em}.saveState{justify-self:end;display:flex;align-items:center;gap:6px;color:#668792;font-size:12px}.groupMain{width:min(1380px,calc(100% - 40px));margin:0 auto;padding:28px 0 70px}.classHero{min-height:190px;display:flex;justify-content:space-between;align-items:center;gap:30px;padding:34px 40px;margin-bottom:20px;border-radius:28px;background:linear-gradient(125deg,#dff3ff 0%,#caedf4 48%,#a9dce5 100%);box-shadow:0 18px 45px rgba(65,120,140,.12)}.bluePill{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.65);color:#43889b;font-size:11px;font-weight:900}.classHero h1{margin:13px 0 7px;font-size:clamp(27px,3vw,40px);letter-spacing:-.035em}.classHero p{margin:0;color:#5d8191}.heroStats{display:flex;gap:10px}.heroStats div{min-width:104px;padding:18px;border:1px solid rgba(255,255,255,.62);border-radius:19px;background:rgba(255,255,255,.48);text-align:center}.heroStats b,.heroStats span{display:block}.heroStats b{font-size:20px}.heroStats span{margin-top:5px;color:#648594;font-size:11px}.groupCard{margin-bottom:20px;padding:26px;border:1px solid #dce9ed;border-radius:23px;background:#fff;box-shadow:0 10px 30px rgba(50,91,109,.06)}.sectionHeading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:22px}.sectionHeading>div{display:flex;align-items:center;gap:12px}.sectionHeading h2,.sectionHeading p{margin:0}.sectionHeading h2{font-size:19px}.sectionHeading p{margin-top:4px;color:#8098a3;font-size:12px}.stepBadge{width:40px;height:40px;display:grid;place-items:center;border-radius:13px;background:var(--baby);color:#3f93a8;font-size:12px;font-weight:900}.classInfoGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:13px}.groupField{display:grid;gap:7px}.groupField span{color:#617e8c;font-size:12px;font-weight:800}.groupField input,.addStudentRow input,.quickInput{width:100%;border:1px solid var(--line);border-radius:11px;background:#fbfdfe;color:var(--ink);padding:11px 12px;outline:none}.groupField input:focus,.addStudentRow input:focus,.quickInput:focus,.classNotes:focus,.resultCard textarea:focus{border-color:var(--maldives);box-shadow:0 0 0 3px rgba(67,188,203,.12)}.scoreLaunch{display:flex;align-items:center;gap:8px;border:0;border-radius:12px;background:#3eaec0;color:#fff;padding:11px 14px;font-weight:800;cursor:pointer}.scoreLaunch span{padding:3px 7px;border-radius:99px;background:rgba(255,255,255,.18);font-size:11px}.studentTableWrap{overflow-x:auto}.studentTable{width:100%;border-collapse:collapse;min-width:1060px}.studentTable th{padding:10px;color:#78909b;font-size:11px;text-align:left;border-bottom:1px solid #dce8ec}.studentTable td{padding:10px 7px;border-bottom:1px solid #edf3f5}.studentName{display:flex;align-items:center;gap:9px}.studentName>span{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:#e8f6fa;color:#4a91a2;font-size:11px;font-weight:900}.studentName input{width:92px;border:0;background:transparent;color:var(--ink);font-weight:800;outline:none}.miniSegment{display:flex;padding:3px;border-radius:10px;background:#eef5f7}.miniSegment button{border:0;border-radius:8px;background:transparent;color:#78909b;padding:7px 9px;font-size:11px;cursor:pointer;white-space:nowrap}.miniSegment button.active{background:#fff;color:#367f93;font-weight:900;box-shadow:0 2px 8px rgba(55,95,110,.1)}.scoreCell{min-width:72px;border:1px dashed #9fc8d2;border-radius:10px;background:#f3fbfc;color:#4d91a2;padding:9px;cursor:pointer;font-weight:800}.scoreCell.filled{border-style:solid;background:#dff5f6;color:#287d8e}.removeStudent{border:0;background:transparent;color:#a5b6be;cursor:pointer}.addStudentRow{display:flex;gap:9px;margin-top:16px}.addStudentRow input{max-width:230px}.addStudentRow button{border:0;border-radius:11px;background:#e1f2f6;color:#3b8295;padding:0 15px;font-weight:800;cursor:pointer}.classNotes{width:100%;min-height:160px;resize:vertical;border:1px solid var(--line);border-radius:15px;background:#fbfdfe;padding:16px;color:var(--ink);font:inherit;line-height:1.7;outline:none}.generateGroup{width:100%;display:flex;justify-content:center;align-items:center;gap:9px;margin-top:13px;border:0;border-radius:13px;background:linear-gradient(100deg,#4fc1cd,#3b9eb5);color:#fff;padding:14px;font-weight:900;cursor:pointer;box-shadow:0 9px 22px rgba(60,165,182,.2)}.resultGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.resultCard{overflow:hidden;border:1px solid #dce8ec;border-radius:20px;background:#fff}.resultCard header{padding:15px 19px;font-size:17px}.resultCard textarea{width:100%;min-height:150px;border:0;border-top:1px solid #e8f0f2;padding:17px;resize:vertical;color:var(--ink);font:inherit;line-height:1.65;outline:none}.resultCard.pink header{background:#f4d5db}.resultCard.aqua header{background:#bdeae8}.resultCard.green header{background:#cbe8b8}.resultCard.yellow header{background:#f8e7a8}.scoreOverlay{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(27,53,65,.58);backdrop-filter:blur(8px)}.overlayDismiss{position:absolute;right:25px;top:22px;border:0;background:transparent;color:#fff;cursor:pointer}.scoreRecorder{width:min(620px,100%);border-radius:28px;background:#f9fdfe;box-shadow:0 30px 90px rgba(14,42,55,.35);overflow:hidden}.recorderHeader{padding:28px 30px 20px;background:linear-gradient(125deg,#dff3ff,#b9e7ef)}.recorderHeader span{color:#4a8ea1;font-size:11px;font-weight:900;letter-spacing:.1em}.recorderHeader h2{margin:7px 0 2px;font-size:31px}.recorderHeader p{margin:0;color:#6b8997;font-size:13px}.scoreProgress{height:5px;margin-top:20px;border-radius:99px;background:rgba(255,255,255,.7);overflow:hidden}.scoreProgress i{display:block;height:100%;border-radius:inherit;background:#3aaabd;transition:width .2s}.recorderModes{display:grid;grid-template-columns:1fr 1fr;margin:20px 28px 0;padding:4px;border-radius:12px;background:#eaf3f6}.recorderModes button,.rangeTabs button{border:0;border-radius:9px;background:transparent;color:#78929e;padding:10px;font-weight:800;cursor:pointer}.recorderModes button.active,.rangeTabs button.active{background:#fff;color:#35869a;box-shadow:0 3px 10px rgba(60,95,110,.1)}.rangeTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:18px 28px 0}.scoreButtons{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:20px 28px 8px}.scoreButtons button{aspect-ratio:1;border:1px solid #cae2e8;border-radius:15px;background:#fff;color:#31596a;font-size:18px;font-weight:900;cursor:pointer;transition:.15s}.scoreButtons button:hover{transform:translateY(-2px);border-color:#43bccc;background:#dff5f7;color:#237d8f}.autoHint{text-align:center;color:#88a0aa;font-size:12px}.typeScore{display:grid;justify-items:center;padding:34px 28px 23px}.typeScore label{display:flex;align-items:baseline;gap:12px}.typeScore input{width:150px;border:0;border-bottom:3px solid #76c9d5;background:transparent;color:#285365;font-size:58px;font-weight:900;text-align:center;outline:none}.typeScore label span{color:#78929e;font-size:20px}.typeScore>button{margin-top:25px;border:0;border-radius:12px;background:#3aaabc;color:#fff;padding:12px 22px;font-weight:900;cursor:pointer}.typeScore p{color:#8da2ab;font-size:12px}.recorderFooter{display:grid;grid-template-columns:100px 1fr 100px;align-items:center;gap:12px;padding:16px 24px;border-top:1px solid #e2edf0}.recorderFooter>button{display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:#648390;font-weight:800;cursor:pointer}.recorderFooter>button:disabled{opacity:.3}.recorderFooter>div{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}.recorderFooter>div button{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:#d2e0e5;cursor:pointer}.recorderFooter>div button.done{background:#70c9d3}.recorderFooter>div button.current{outline:3px solid rgba(65,181,198,.2);background:#2e99ad}.scoreLaunch:disabled{opacity:.45;cursor:not-allowed}@media(max-width:1050px){.classInfoGrid{grid-template-columns:repeat(3,1fr)}.classHero{align-items:flex-start;flex-direction:column}.heroStats{width:100%}.heroStats div{flex:1}.resultGrid{grid-template-columns:1fr}}@media(max-width:680px){.groupTopbar{grid-template-columns:auto 1fr;height:62px;padding:0 15px}.groupBrand{justify-self:end}.saveState{display:none}.groupMain{width:min(100% - 22px,1380px);padding-top:12px}.classHero{padding:24px;border-radius:21px}.heroStats{overflow-x:auto}.heroStats div{min-width:90px}.groupCard{padding:18px;border-radius:18px}.sectionHeading{align-items:flex-start;flex-direction:column}.scoreLaunch{width:100%;justify-content:center}.classInfoGrid{grid-template-columns:repeat(2,1fr)}.scoreButtons{grid-template-columns:repeat(4,1fr)}.recorderFooter{grid-template-columns:75px 1fr 75px;padding:14px 10px}.groupBrand small{display:none}}
`;
