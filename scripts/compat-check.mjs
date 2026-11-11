// Checks figdiff against files saved by a real figcraft-cli.
//
//   node scripts/compat-check.mjs <figcraft-cli> <examples-dir> [report.md]
//
// For every .figcraft file in <examples-dir> it runs two checks:
//   1. re-save:  figcraft-cli convert  a.figcraft -> b.figcraft ; figdiff a b must report nothing
//   2. one edit: figcraft-cli run (rename one node) ; figdiff must report the rename, with nothing added, removed or moved
//   3. positions: figdiff asks figcraft-cli where that node is, for highlighting changes in HTML reports (informational)
// It needs `npm run build` first. The exit code is 1 when any check fails.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseFigcraft } from "../dist/index.js";
import { createCliRenderer } from "../dist/render/figcraft-cli.js";

const [cli, examplesDir, reportPath] = process.argv.slice(2);
if (!cli || !examplesDir) {
  console.error("usage: node scripts/compat-check.mjs <figcraft-cli> <examples-dir> [report.md]");
  process.exit(2);
}
const figdiff = resolve(import.meta.dirname, "../dist/cli.js");
const work = mkdtempSync(join(tmpdir(), "figdiff-compat-"));

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const diff = (a, b) => JSON.parse(sh("node", [figdiff, a, b, "--json"]));
const oneLine = (e) =>
  String(e.stderr || e.message)
    .split("\n")
    .find((l) => l.trim()) ?? "error";

/** The first node that can be renamed without side effects: a text or rectangle, else any non-page node. */
function pickNode(tree) {
  let fallback;
  const stack = [...tree.children].reverse();
  while (stack.length) {
    const n = stack.pop();
    if (n.type === "text" || n.type === "rectangle") return n;
    if (n.type !== "page" && !fallback) fallback = n;
    for (const c of [...n.children].reverse()) stack.push(c);
  }
  return fallback;
}

const short = (v) => {
  const t = JSON.stringify(v) ?? "undefined";
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
};
// For objects, show only the keys that differ.
const keyDiff = (a, b) => {
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    return keys.map((k) => `${k}: ${short(a[k])} → ${short(b[k])}`).join("; ");
  }
  return `${short(a)} → ${short(b)}`;
};

let version = "unknown";
try {
  version = sh(cli, ["--version"]).trim();
} catch {
  /* older builds */
}

const rows = [];
const details = [];
let failed = 0;
for (const file of readdirSync(examplesDir)
  .filter((f) => f.endsWith(".figcraft"))
  .sort()) {
  const src = join(examplesDir, file);
  const row = { file, resave: "", edit: "", bounds: "" };

  // 1. a plain re-save must not look like a change
  try {
    const out = join(work, `resaved-${file}`);
    sh(cli, ["convert", src, out]);
    const r = diff(src, out);
    const n = r.summary.changes;
    if (n === 0) row.resave = "no changes";
    else {
      failed++;
      const kinds = {};
      for (const c of r.changes) for (const p of c.props ?? [{ prop: `(${c.kind})` }]) kinds[p.prop] = (kinds[p.prop] ?? 0) + 1;
      const counts = Object.entries(kinds)
        .map(([k, v]) => `${k} ×${v}`)
        .join(", ");
      const seen = new Set();
      const sample = r.changes
        .flatMap((c) => (c.props ?? []).map((p) => `node ${c.id} ${p.prop}: ${keyDiff(p.from, p.to)}`))
        .filter((l) => {
          const k = l.replace(/^node \d+ /, "");
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 6);
      row.resave = `**${n} changes** (${counts})`;
      details.push(`### ${file}\n\n${sample.map((l) => `- \`${l.replace(/`/g, "'")}\``).join("\n")}`);
    }
  } catch (e) {
    failed++;
    row.resave = `**error**: ${oneLine(e)}`;
  }

  // 2. one edit made by FigCraft's own engine must show up as a rename, without structural changes
  try {
    const node = pickNode(parseFigcraft(src));
    if (!node) throw new Error("no editable node");
    const script = join(work, `edit-${file}.json`);
    const edited = join(work, `edited-${file}`);
    writeFileSync(
      script,
      JSON.stringify([{ command: "node.set", params: { ids: [Number(node.id)], props: { name: "figdiff-compat-check" } } }]),
    );
    sh(cli, ["run", script, "--in", src, "--out", edited]);
    const r = diff(src, edited);
    // FigCraft re-measures text and auto layout when it applies an edit headlessly (no system fonts),
    // so sizes can move by a fraction of a pixel. That is not an id problem: what must hold is that
    // nothing is added, removed or moved, and that the rename itself is reported.
    const structural = r.changes.filter((c) => c.kind !== "modified");
    const renamedOk = r.changes.some((c) => String(c.id) === String(node.id) && c.props?.some((p) => p.prop === "name"));
    const side = r.changes.reduce(
      (n, c) => n + (c.props ?? []).filter((p) => !(String(c.id) === String(node.id) && p.prop === "name")).length,
      0,
    );
    const only = structural.length === 0 && renamedOk;
    if (side > 0) {
      const lines = r.changes.flatMap((c) => (c.props ?? []).map((p) => `node ${c.id} ${p.prop}: ${keyDiff(p.from, p.to)}`));
      const seenKinds = new Set();
      const uniq = lines
        .filter((l) => {
          const k = l.replace(/^node \d+ /, "");
          if (seenKinds.has(k)) return false;
          seenKinds.add(k);
          return true;
        })
        .slice(0, 4);
      details.push(`### ${file}: after renaming node ${node.id}\n\n${uniq.map((l) => `- \`${l.replace(/`/g, "'")}\``).join("\n")}`);
    }
    if (only) row.edit = `ok (renamed ${node.type} ${node.id}${side ? `; ${side} relayout side effects, see below` : ""})`;
    else {
      failed++;
      row.edit = `**unexpected**: ${structural.length} added/removed/moved nodes${renamedOk ? "" : ", rename not reported"}`;
    }
  } catch (e) {
    failed++;
    row.edit = `**error**: ${oneLine(e)}`;
  }
  // 3. positions, used to highlight changes on the images; not having them is not a failure
  try {
    const node = pickNode(parseFigcraft(src));
    const renderer = createCliRenderer(cli);
    const b = node ? renderer.bounds(src, [String(node.id)]).get(String(node.id)) : undefined;
    row.bounds = b
      ? `ok (${b.width}×${b.height} at ${b.x}, ${b.y})`
      : `not available${renderer.lastError ? `: ${renderer.lastError}` : ""}`;
  } catch (e) {
    row.bounds = `not available: ${oneLine(e)}`;
  }
  rows.push(row);
}

const md = [
  `## figdiff compatibility check`,
  ``,
  `figcraft-cli: \`${version}\``,
  ``,
  `| File | Re-saved by FigCraft | One rename by FigCraft (ids kept) | Node positions |`,
  `| --- | --- | --- | --- |`,
  ...rows.map((r) => `| ${basename(r.file)} | ${r.resave} | ${r.edit} | ${String(r.bounds).replace(/\|/g, "/")} |`),
  ``,
  failed === 0 ? `All ${rows.length} files passed.` : `${failed} check(s) failed.`,
  ...(details.length ? [``, `### Examples of what changed on re-save`, ``, ...details] : []),
].join("\n");
console.log(md);
if (reportPath) writeFileSync(reportPath, md + "\n");
process.exit(failed === 0 ? 0 : 1);
