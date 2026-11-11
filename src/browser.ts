/**
 * Browser entry point. Everything reachable from here is free of Node APIs, so it can be
 * served as plain ES modules. The website uses it to compare two files in the visitor's browser.
 */
import { diffTrees } from "./diff/diff.js";
import { diffTokens } from "./diff/tokens.js";
import { summarize } from "./diff/summary.js";
import { formatText } from "./report.js";
import { formatMarkdown } from "./markdown.js";
import { formatHtml } from "./html.js";
import { parseFigcraftBytes } from "./parser/bytes.js";
import type { Change, Summary, TokenChange } from "./diff/types.js";

export interface CompareOptions {
  /** Names shown in the HTML report. */
  beforeName?: string;
  afterName?: string;
  /** Number changes up to this size in design nodes are ignored. Default 0. */
  tolerance?: number;
  /** Pair nodes whose ids changed by name and path. Default true. */
  matchByName?: boolean;
}

export interface CompareResult {
  summary: Summary;
  changes: Change[];
  tokens: TokenChange[];
  /** The same text `figdiff` prints. */
  text: string;
  /** The changes as Markdown, the same as `figdiff --markdown`. */
  markdown: string;
  /** The same JSON `figdiff --json` prints. */
  json: string;
  /** A self-contained HTML report (without images). */
  html: string;
}

/** Compare two .figcraft files given as bytes. Throws an Error with a readable message on bad input. */
export function compareFigcraft(before: Uint8Array, after: Uint8Array, options: CompareOptions = {}): CompareResult {
  const beforeName = options.beforeName ?? "before.figcraft";
  const afterName = options.afterName ?? "after.figcraft";
  const a = parseFigcraftBytes(before, beforeName);
  const b = parseFigcraftBytes(after, afterName);
  const changes = diffTrees(a.tree, b.tree, { tolerance: options.tolerance ?? 0, matchByName: options.matchByName });
  const tokens = diffTokens(a.tokens, b.tokens);
  const summary = summarize(changes, tokens);
  return {
    summary,
    changes,
    tokens,
    text: formatText(changes, tokens),
    markdown: formatMarkdown(changes, tokens),
    json: JSON.stringify({ summary, changes, tokens }, null, 2) + "\n",
    html: formatHtml(changes, { beforeName, afterName, tokens }),
  };
}

export { parseFigcraftBytes } from "./parser/bytes.js";
export { diffTrees } from "./diff/diff.js";
export { diffTokens } from "./diff/tokens.js";
export { summarize } from "./diff/summary.js";
export { formatText, formatSummary, formatValue, describeToken } from "./report.js";
export { formatMarkdown } from "./markdown.js";
export { formatHtml } from "./html.js";
export type { Change, DesignNode, Summary, Token, TokenChange } from "./diff/types.js";
