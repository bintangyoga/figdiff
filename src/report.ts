import type { Change } from "./diff/types.js";

function show(value: unknown): string {
  if (value === undefined) return "(none)";
  return typeof value === "string" ? value : JSON.stringify(value);
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
          lines.push(`~ ${c.path}: ${p.prop} ${show(p.from)} → ${show(p.to)}`);
        }
        break;
    }
  }
  lines.push("", `${changes.length} changed node${changes.length === 1 ? "" : "s"}`);
  return lines.join("\n") + "\n";
}
