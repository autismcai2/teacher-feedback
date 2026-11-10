import { useEffect, useRef, useState } from "react";
import "./feedback-details.css";

export default function FeedbackDetailsDialog({ onCancel, onComplete, initialDetails, onDraftChange, questions }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(initialDetails || {});
  const dialog = useRef(null);
  const input = useRef(null);
  const { key, label, question: title, placeholder, evidence } = questions[step];

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => { input.current?.focus(); }, [step]);

  function advance(skip) {
    const next = { ...details, [key]: skip ? "" : (details[key] || "").trim() };
    setDetails(next);
    onDraftChange(next);
    if (step === questions.length - 1) onComplete(next);
    else setStep(step + 1);
  }

  return (
    <dialog ref={dialog} className="feedbackDetailsDialog" onCancel={(event) => { event.preventDefault(); onCancel(); }} aria-labelledby="feedbackDetailsTitle">
      <header><span>补充课堂信息 · {step + 1} / {questions.length}</span><button type="button" onClick={onCancel} aria-label="取消生成">×</button></header>
      <h2 id="feedbackDetailsTitle">{title}</h2>
      <p>AI 已阅读课堂记录和页面信息，仅询问仍缺少依据的分块。可以填写或跳过。</p>
      {evidence && <p className="feedbackDetailsReason">{evidence}</p>}
      <label htmlFor="feedbackDetailsInput">{label}</label>
      <textarea id="feedbackDetailsInput" ref={input} value={details[key] || ""} placeholder={placeholder} onChange={(event) => { const next = { ...details, [key]: event.target.value }; setDetails(next); onDraftChange(next); }} />
      <p className="feedbackDetailsNotice">跳过的分块会根据已有课堂信息补全草稿；不会更改明确填写的事实。下载前会列出需要核对的补全部分。</p>
      <footer>
        <button type="button" onClick={() => step ? setStep(step - 1) : onCancel()}>{step ? "上一步" : "取消"}</button>
        <button type="button" onClick={() => advance(true)}>{step === questions.length - 1 ? "跳过并生成" : "跳过此项"}</button>
        <button type="button" className="feedbackDetailsPrimary" disabled={!(details[key] || "").trim()} onClick={() => advance(false)}>{step === questions.length - 1 ? "确认并生成" : "下一项"}</button>
      </footer>
    </dialog>
  );
}
