import { useEffect, useRef, useState } from "react";
import "./feedback-details.css";

const steps = [
  ["practice", "课堂练习", "本节课做了哪些练习？", "例如：练习根据图像判断一次函数表达式；也可填写“本节没有练习”。"],
  ["mastery", "答题与掌握情况", "练习完成和知识掌握情况如何？", "例如：基础题能独立完成，变式题需要提示；班课可按学生分别填写。"],
  ["homework", "课后作业", "本节课布置了什么作业？", "例如：巩固本节基础题并订正错题；也可填写“本节不布置作业”。"],
];

export default function FeedbackDetailsDialog({ onCancel, onComplete, initialDetails, onDraftChange }) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(initialDetails || { practice: "", mastery: "", homework: "" });
  const dialog = useRef(null);
  const input = useRef(null);
  const [key, label, title, placeholder] = steps[step];

  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => { input.current?.focus(); }, [step]);

  function advance(skip) {
    const next = { ...details, [key]: skip ? "" : details[key].trim() };
    setDetails(next);
    onDraftChange(next);
    if (step === steps.length - 1) onComplete(next);
    else setStep(step + 1);
  }

  return (
    <dialog ref={dialog} className="feedbackDetailsDialog" onCancel={(event) => { event.preventDefault(); onCancel(); }} aria-labelledby="feedbackDetailsTitle">
      <header><span>补充课堂信息 · {step + 1} / {steps.length}</span><button type="button" onClick={onCancel} aria-label="取消生成">×</button></header>
      <h2 id="feedbackDetailsTitle">{title}</h2>
      <p>已有内容无需重复填写，可以逐项跳过。原始记录与补充信息优先使用。</p>
      <label htmlFor="feedbackDetailsInput">{label}</label>
      <textarea id="feedbackDetailsInput" ref={input} value={details[key]} placeholder={placeholder} onChange={(event) => { const next = { ...details, [key]: event.target.value }; setDetails(next); onDraftChange(next); }} />
      <p className="feedbackDetailsNotice">跳过且原记录未说明的内容，将根据本节知识点模拟常见练习、答题表现及巩固建议。下载前请核对。</p>
      <footer>
        <button type="button" onClick={() => step ? setStep(step - 1) : onCancel()}>{step ? "上一步" : "取消"}</button>
        <button type="button" onClick={() => advance(true)}>{step === 2 ? "跳过并生成" : "跳过此项"}</button>
        <button type="button" className="feedbackDetailsPrimary" disabled={!details[key].trim()} onClick={() => advance(false)}>{step === 2 ? "确认并生成" : "下一项"}</button>
      </footer>
    </dialog>
  );
}
