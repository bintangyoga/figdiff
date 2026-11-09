export { diffTrees } from "./diff/diff.js";
export { summarize } from "./diff/summary.js";
export { parseFigcraft, readDocumentJson, documentToTree } from "./parser/index.js";
export { formatText, formatSummary, formatValue } from "./report.js";
export { run } from "./run.js";
export type { Change, DesignNode, PropChange, Summary } from "./diff/types.js";
export { formatHtml, frameKey, escapeHtml } from "./html.js";
export type { FrameImages, HtmlOptions } from "./html.js";
