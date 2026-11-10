export function downloadReviewMessage(info) {
  const fields = info?.autoCompletedFields;
  const labels = Array.isArray(fields) ? fields.map((field) => field.label).filter(Boolean) : [];
  const description = !Array.isArray(fields)
    ? "请核对课堂反馈与学生实际情况一致后再发送给家长。"
    : labels.length
      ? `本次以下内容由 AI 推导或补全：${[...new Set(labels)].join("、")}。请核对与实际教学及学生表现一致，再发送给家长。`
      : "本次未发现需要额外模拟补全的分块，反馈已根据课堂记录及已提供的信息整理。请核对后再发送给家长。";
  return `下载前请核对：${description}\n\n点击“确定”继续保存并下载，点击“取消”返回修改。`;
}
