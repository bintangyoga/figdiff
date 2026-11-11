import type { Change, TokenChange } from "./diff/types.js";
import { summarize } from "./diff/summary.js";
import { formatSummary, formatValue } from "./report.js";

const SEP = " › ";

/** Layer names and values come from the file, so they are put in code spans and never interpreted as Markdown. */
export function code(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${flat.startsWith("`") || flat.endsWith("`") ? ` ${flat} ` : flat}${fence}`;
}

const prop = (p: { prop: string; from: unknown; to: unknown }) => `${p.prop}: ${code(formatValue(p.from))} → ${code(formatValue(p.to))}`;

function line(c: Change, label: string): string[] {
  const name = code(label);
  switch (c.kind) {
    case "added":
      return [`- ➕ ${name} (${c.type}) added`];
    case "removed":
      return [`- ➖ ${name} (${c.type}) removed`];
    case "moved":
      return [`- ↪️ ${name} moved from ${code(c.fromTrail.join(SEP) || "(root)")}`];
    case "reordered":
      return [`- 🔀 ${name} layer order changed`];
    case "modified":
      return c.props.map((p) => `- ✏️ ${name} ${prop(p)}`);
  }
}

function tokenLine(t: TokenChange): string[] {
  const name = code(`${t.entity} ${t.name}`);
  if (t.kind !== "modified") {
    const sign = t.kind === "added" ? "➕" : "➖";
    return [`- ${sign} ${name} ${t.kind}${t.detail ? ` (${t.detail})` : ""}`];
  }
  return t.props.map((p) => `- ✏️ ${name} ${prop(p)}`);
}

/** The report as Markdown, grouped by page and top-level frame. Safe to paste into a pull request or a CI summary. */
export function formatMarkdown(changes: Change[], tokens: TokenChange[] = []): string {
  if (changes.length === 0 && tokens.length === 0) return "No changes.\n";

  const pages = new Map<string, Map<string, Change[]>>();
  for (const c of changes) {
    const page = c.trail[0] ?? "(document)";
    const frame = c.trail[1] ?? "";
    const frames = pages.get(page) ?? new Map<string, Change[]>();
    frames.set(frame, [...(frames.get(frame) ?? []), c]);
    pages.set(page, frames);
  }

  const out: string[] = [`**${formatSummary(summarize(changes, tokens))}**`, ""];
  for (const [page, frames] of pages) {
    out.push(`### Page ${code(page)}`, "");
    for (const [frame, group] of frames) {
      if (frame === "") {
        for (const c of group) out.push(...line(c, "(page)"));
        out.push("");
        continue;
      }
      out.push(`#### Frame ${code(frame)}`, "");
      for (const c of group) out.push(...line(c, c.trail.length > 2 ? c.trail.slice(2).join(SEP) : "(frame itself)"));
      out.push("");
    }
  }
  if (tokens.length > 0) {
    out.push("### Variables and styles", "");
    for (const t of tokens) out.push(...tokenLine(t));
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}
