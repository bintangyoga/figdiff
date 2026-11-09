import type { Change, Summary, TokenChange } from "./diff/types.js";
import { summarize } from "./diff/summary.js";

type Raw = Record<string, unknown>;

const hex = (n: unknown): string =>
  Math.round(Math.min(1, Math.max(0, Number(n))) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();

function isColor(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v;
}

function colorToHex(c: Raw): string {
  const alpha = c.a === undefined ? 1 : Number(c.a);
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}${alpha < 1 ? hex(alpha) : ""}`;
}

function describePaint(p: unknown): string | undefined {
  if (typeof p !== "object" || p === null) return undefined;
  const paint = p as Raw;
  const hidden = paint.visible === false ? " (hidden)" : "";
  if (paint.type === "solid" && isColor(paint.color)) return colorToHex(paint.color) + hidden;
  if (paint.type === "gradient") {
    const stops = Array.isArray(paint.stops) ? paint.stops.length : 0;
    return `${String(paint.kind ?? "")} gradient, ${stops} stops${hidden}`.trim();
  }
  if (typeof paint.type === "string") return `${paint.type}${hidden}`;
  return undefined;
}

/** Render a property value for humans: colors as hex, paints in short form, everything else as JSON. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return "(none)";
  if (typeof value === "string") return value;
  if (isColor(value)) return colorToHex(value);
  if (Array.isArray(value) && value.length > 0) {
    const paints = value.map(describePaint);
    if (paints.every((p) => p !== undefined)) return paints.join(", ");
  }
  if (Array.isArray(value) && value.length === 0) return "(none)";
  return JSON.stringify(value);
}

const SEP = " › ";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One line, for example "12 changes in 3 frames (2 added, 1 removed, 9 property changes)". */
export function formatSummary(s: Summary): string {
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} added`);
  if (s.removed) parts.push(`${s.removed} removed`);
  if (s.moved) parts.push(`${s.moved} moved`);
  if (s.reordered) parts.push(`${s.reordered} reordered`);
  if (s.propertyChanges) parts.push(plural(s.propertyChanges, "property change"));
  if (s.tokenChanges) parts.push(plural(s.tokenChanges, "token change"));
  const where = s.frames > 0 ? ` in ${plural(s.frames, "frame")}` : "";
  return `${plural(s.changes, "change")}${where} (${parts.join(", ")})`;
}

function describe(c: Change, label: string): string[] {
  switch (c.kind) {
    case "added":
      return [`+ ${label} (${c.type})`];
    case "removed":
      return [`- ${label} (${c.type})`];
    case "moved":
      return [`> ${label}: moved from ${c.fromTrail.join(SEP) || "(root)"}`];
    case "reordered":
      return [`~ ${label}: layer order changed`];
    case "modified":
      return c.props.map((p) => `~ ${label}: ${p.prop} ${formatValue(p.from)} → ${formatValue(p.to)}`);
  }
}

/** Human-readable report, grouped by page and top-level frame. */
const ENTITY_LABEL = { variable: "Variable", style: "Style", collection: "Collection" } as const;

/** Text lines for one variable, style or collection change. */
export function describeToken(c: TokenChange): string[] {
  const label = `${ENTITY_LABEL[c.entity]} "${c.name}"`;
  switch (c.kind) {
    case "added":
      return [`+ ${label}${c.detail ? ` (${c.detail})` : ""}`];
    case "removed":
      return [`- ${label}${c.detail ? ` (${c.detail})` : ""}`];
    case "modified":
      return c.props.map((p) => `~ ${label}: ${p.prop} ${formatValue(p.from)} → ${formatValue(p.to)}`);
  }
}

export function formatText(changes: Change[], tokens: TokenChange[] = []): string {
  if (changes.length === 0 && tokens.length === 0) return "No changes.\n";

  // page -> frame ("" for changes on the page itself) -> changes, in first-seen order
  const pages = new Map<string, Map<string, Change[]>>();
  for (const c of changes) {
    const page = c.trail[0] ?? "(document)";
    const frame = c.trail[1] ?? "";
    const frames = pages.get(page) ?? new Map<string, Change[]>();
    frames.set(frame, [...(frames.get(frame) ?? []), c]);
    pages.set(page, frames);
  }

  const lines: string[] = [];
  for (const [page, frames] of pages) {
    lines.push(`Page "${page}"`);
    for (const [frame, group] of frames) {
      if (frame === "") {
        for (const c of group) lines.push(...describe(c, "(page)").map((l) => `  ${l}`));
        continue;
      }
      lines.push(`  Frame "${frame}"`);
      for (const c of group) {
        const label = c.trail.length > 2 ? c.trail.slice(2).join(SEP) : "(frame itself)";
        lines.push(...describe(c, label).map((l) => `    ${l}`));
      }
    }
  }
  if (tokens.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("Variables and styles");
    for (const t of tokens) lines.push(...describeToken(t).map((l) => `  ${l}`));
  }
  lines.push("", formatSummary(summarize(changes, tokens)));
  return lines.join("\n") + "\n";
}
