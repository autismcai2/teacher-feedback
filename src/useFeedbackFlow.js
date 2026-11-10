import { useEffect, useRef, useState } from "react";

async function requestJson(url, body, signal) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("接口未返回有效数据，请确认前后端均已部署最新版本。"); }
  if (!response.ok) throw new Error(data.error || "AI 请求失败，请重试。");
  return data;
}

export default function useFeedbackFlow({ context, generationUrl, onGenerated, onError }) {
  const [state, setState] = useState({ phase: "idle" });
  const sequence = useRef(0);
  const controller = useRef(null);
  const inFlight = useRef(false);
  const contextKey = JSON.stringify(context);

  // Ignore and abort any request for a classroom that the teacher has since left/edited.
  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
    inFlight.current = false;
  }, [contextKey]);

  async function generate(snapshot, analysis, details, id, signal) {
    setState({ phase: "generating", contextKey });
    const data = await requestJson(generationUrl, { ...snapshot, analysis, supplementalDetails: details }, signal);
    if (id === sequence.current) onGenerated(data);
  }

  function handleError(error, id) {
    if (id === sequence.current && error.name !== "AbortError") onError(error.message);
  }

  async function prepare(details) {
    if (inFlight.current) return;
    inFlight.current = true;
    const id = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const snapshot = JSON.parse(contextKey);
    onError("");
    setState({ phase: "analyzing", contextKey });
    try {
      const analysis = await requestJson("/api/analyze-feedback", { ...snapshot, supplementalDetails: details }, abort.signal);
      if (id !== sequence.current) return;
      if (!Array.isArray(analysis.questions)) throw new Error("AI 缺项分析格式不正确，请重试。");
      if (analysis.questions.length) setState({ phase: "asking", contextKey, analysis, snapshot });
      else {
        await generate(snapshot, analysis, details, id, abort.signal);
        if (id === sequence.current) setState({ phase: "idle" });
      }
    } catch (error) {
      handleError(error, id);
      if (id === sequence.current) setState({ phase: "idle" });
    } finally {
      if (id === sequence.current) inFlight.current = false;
    }
  }

  async function complete(details) {
    if (inFlight.current || state.contextKey !== contextKey || state.phase !== "asking") return;
    inFlight.current = true;
    const id = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    try {
      await generate(state.snapshot, state.analysis, details, id, abort.signal);
    } catch (error) { handleError(error, id); }
    finally {
      if (id === sequence.current) {
        setState({ phase: "idle" });
        inFlight.current = false;
      }
    }
  }

  function cancel() {
    sequence.current += 1;
    controller.current?.abort();
    inFlight.current = false;
    setState({ phase: "idle" });
  }

  const current = state.contextKey === contextKey;
  return { prepare, complete, cancel, analyzing: current && state.phase === "analyzing", busy: current && ["analyzing", "generating"].includes(state.phase), questions: current && state.phase === "asking" ? state.analysis.questions : null };
}
