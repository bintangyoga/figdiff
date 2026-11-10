#!/usr/bin/env node
// Checks a built site (default: site/dist): every local link and asset exists, every #anchor that points
// into a docs page exists, and the comparison code in the browser bundle gives the expected answer for the
// sample files. Run after `npm run build:site`.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dist = resolve(process.argv[2] ?? "site/dist");
const problems = [];
const fail = (m) => problems.push(m);

const htmlFiles = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".html")) htmlFiles.push(p);
  }
})(dist);

const resolveLocal = (path) => {
  const f = join(dist, path);
  if (existsSync(f) && statSync(f).isDirectory()) return join(f, "index.html");
  return f;
};
const idsCache = new Map();
const idsOf = (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const here = "/" + file.slice(dist.length + 1).replace(/index\.html$/, "");
  if (/\{\{[A-Z_]+\}\}/.test(html)) fail(`${here}: unfilled placeholder ${html.match(/\{\{[A-Z_]+\}\}/)[0]}`);
  if (/<!--include:/.test(html)) fail(`${here}: unfilled include`);
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|data:)/.test(url) || url === "") continue;
    const [pathPart, hash] = url.split("#");
    const path = pathPart.split("?")[0] || here;
    if (!path.startsWith("/")) { fail(`${here}: relative link "${url}" (use absolute paths)`); continue; }
    const target = resolveLocal(path);
    if (!existsSync(target)) { fail(`${here}: "${url}" points to a missing file`); continue; }
    if (hash && target.endsWith(".html") && !idsOf(target).has(hash)) fail(`${here}: "${url}" points to a missing anchor`);
  }
}
for (const need of ["index.html", "docs/index.html", "docs/cli/index.html", "sitemap.xml", "robots.txt", "_headers", "search-index.json", "vendor/fflate.js", "lib/browser.js", "samples/ridgeline-before.figcraft", "samples/ridgeline-after.figcraft"]) {
  if (!existsSync(join(dist, need))) fail(`missing ${need}`);
}

// The browser bundle gives the same answer as the CLI on the sample files.
if (existsSync(join(dist, "lib/browser.js"))) {
  const { compareFigcraft } = await import(pathToFileURL(join(dist, "lib/browser.js")).href);
  const bytes = (n) => new Uint8Array(readFileSync(join(dist, "samples", n)));
  const r = compareFigcraft(bytes("ridgeline-before.figcraft"), bytes("ridgeline-after.figcraft"));
  if (r.summary.changes !== 6 || r.summary.frames !== 2) fail(`sample compare: expected 6 changes in 2 frames, got ${r.summary.changes} in ${r.summary.frames}`);
  if (!r.text.includes("Get started: fills #0E7C66 → #ED731A")) fail("sample compare: the fill change is missing from the text report");
  const same = compareFigcraft(bytes("ridgeline-before.figcraft"), bytes("ridgeline-before.figcraft"));
  if (same.summary.changes !== 0) fail("sample compare: identical files should report no changes");
}

if (problems.length) {
  console.error(`site check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`site check ok: ${htmlFiles.length} pages, links and anchors resolve, sample comparison matches`);
