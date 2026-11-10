// Checks figdiff against files saved by a real figcraft-cli.
//
//   node scripts/compat-check.mjs <figcraft-cli> <examples-dir> [report.md]
//
// For every .figcraft file in <examples-dir> it runs two checks:
//   1. re-save:  figcraft-cli convert  a.figcraft -> b.figcraft ; figdiff a b must report nothing
//   2. one edit: figcraft-cli run (rename one node) ; figdiff must report exactly that node, only `name`
// It needs `npm run build` first. The exit code is 1 when any check fails.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseFigcraft } from "../dist/index.js";

const [cli, examplesDir, reportPath] = process.argv.slice(2);
if (!cli || !examplesDir) {
  console.error("usage: node scripts/compat-check.mjs <figcraft-cli> <examples-dir> [report.md]");
  process.exit(2);
}
const figdiff = resolve(import.meta.dirname, "../dist/cli.js");
const work = mkdtempSync(join(tmpdir(), "figdiff-compat-"));

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const diff = (a, b) => JSON.parse(sh("node", [figdiff, a, b, "--json"]));
const oneLine = (e) => String(e.stderr || e.message).split("\n").find((l) => l.trim()) ?? "error";

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

let version = "unknown";
try { version = sh(cli, ["--version"]).trim(); } catch { /* older builds */ }

const rows = [];
const details = [];
let failed = 0;
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith(".figcraft")).sort()) {
  const src = join(examplesDir, file);
  const row = { file, resave: "", edit: "" };

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
      const counts = Object.entries(kinds).map(([k, v]) => `${k} ×${v}`).join(", ");
      const short = (v) => { const t = JSON.stringify(v) ?? "undefined"; return t.length > 90 ? `${t.slice(0, 90)}…` : t; };
      const sample = r.changes.flatMap((c) => (c.props ?? []).map((p) => `node ${c.id} ${p.prop}: ${short(p.from)} → ${short(p.to)}`)).slice(0, 3);
      row.resave = `**${n} changes** (${counts})`;
      details.push(`### ${file}\n\n${sample.map((l) => `- \`${l.replace(/`/g, "'")}\``).join("\n")}`);
    }
  } catch (e) {
    failed++;
    row.resave = `**error**: ${oneLine(e)}`;
  }

  // 2. one edit made by FigCraft's own engine must show up as exactly one change
  try {
    const node = pickNode(parseFigcraft(src));
    if (!node) throw new Error("no editable node");
    const script = join(work, `edit-${file}.json`);
    const edited = join(work, `edited-${file}`);
    writeFileSync(script, JSON.stringify([{ command: "node.set", params: { ids: [Number(node.id)], props: { name: "figdiff-compat-check" } } }]));
    sh(cli, ["run", script, "--in", src, "--out", edited]);
    const r = diff(src, edited);
    const only = r.changes.length === 1 && r.changes[0].kind === "modified" && String(r.changes[0].id) === String(node.id)
      && r.changes[0].props.length === 1 && r.changes[0].props[0].prop === "name" && (r.tokens ?? []).length === 0;
    if (only) row.edit = `ok (renamed ${node.type} ${node.id})`;
    else {
      failed++;
      row.edit = `**unexpected**: ${r.changes.length} changes, ${(r.tokens ?? []).length} token changes, e.g. ${r.changes.slice(0, 2).map((c) => `${c.kind} ${c.id}`).join("; ")}`;
    }
  } catch (e) {
    failed++;
    row.edit = `**error**: ${oneLine(e)}`;
  }
  rows.push(row);
}

const md = [
  `## figdiff compatibility check`,
  ``,
  `figcraft-cli: \`${version}\``,
  ``,
  `| File | Re-saved by FigCraft | One rename by FigCraft |`,
  `| --- | --- | --- |`,
  ...rows.map((r) => `| ${basename(r.file)} | ${r.resave} | ${r.edit} |`),
  ``,
  failed === 0 ? `All ${rows.length} files passed.` : `${failed} check(s) failed.`,
  ...(details.length ? [``, `### Examples of what changed on re-save`, ``, ...details] : []),
].join("\n");
console.log(md);
if (reportPath) writeFileSync(reportPath, md + "\n");
process.exit(failed === 0 ? 0 : 1);
