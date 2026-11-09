import type { Change } from "./diff/types.js";

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

export function formatText(changes: Change[]): string {
  if (changes.length === 0) return "No changes.\n";
  const lines: string[] = [];
  for (const c of changes) {
    switch (c.kind) {
      case "added":
        lines.push(`+ ${c.path} (${c.type})`);
        break;
      case "removed":
        lines.push(`- ${c.path} (${c.type})`);
        break;
      case "moved":
        lines.push(`> ${c.to} (moved from ${c.from})`);
        break;
      case "modified":
        for (const p of c.props) {
          lines.push(`~ ${c.path}: ${p.prop} ${formatValue(p.from)} → ${formatValue(p.to)}`);
        }
        break;
    }
  }
  lines.push("", `${changes.length} changed node${changes.length === 1 ? "" : "s"}`);
  return lines.join("\n") + "\n";
}
