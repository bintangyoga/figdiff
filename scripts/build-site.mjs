#!/usr/bin/env node
// Builds the figdiff website into site/dist. Run after `npm run build` (which compiles src/ to dist/).
//
//   node scripts/build-site.mjs [--out site/dist] [--fflate path/to/fflate-browser.js]
//
// The site is plain HTML, CSS and ES modules: there is no bundler. The comparison code is the same
// compiled code the CLI uses (dist/browser.js and what it imports); the build copies exactly the
// modules reachable from it and refuses to continue if any of them needs a Node API.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, markdownToHtml } from "./markdown.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const out = resolve(root, arg("--out", "site/dist"));
const fflatePath = resolve(root, arg("--fflate", "node_modules/fflate/esm/browser.js"));
const SITE_URL = (process.env.SITE_URL || "https://figdiff.bintangyoga.dev").replace(/\/$/, "");
const REPO = "https://github.com/bintangyoga/figdiff";

const read = (p) => readFileSync(p, "utf8");
const write = (rel, content) => {
  const target = join(out, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
};

// ---------- 0. clean ----------
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---------- 1. static files ----------
cpSync(join(root, "site/public"), out, { recursive: true });

// ---------- 2. the comparison code, copied from the compiled output ----------
const distDir = join(root, "dist");
if (!existsSync(join(distDir, "browser.js"))) throw new Error("dist/browser.js not found. Run `npm run build` first.");
const seen = new Set();
const queue = ["browser.js"];
while (queue.length) {
  const rel = queue.pop();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const code = read(join(distDir, rel));
  for (const m of code.matchAll(/(?:import|export)\s[^"']*?from\s+["']([^"']+)["']/g)) {
    const spec = m[1];
    if (spec.startsWith(".")) queue.push(join(dirname(rel), spec).replace(/\\/g, "/"));
    else if (spec !== "fflate") throw new Error(`${rel} imports "${spec}", which the browser build cannot serve. Keep browser.ts free of Node APIs.`);
  }
}
for (const rel of seen) write(join("lib", rel), read(join(distDir, rel)));
if (!existsSync(fflatePath)) throw new Error(`fflate browser build not found at ${fflatePath}. Run \`npm ci\` first.`);
write("vendor/fflate.js", read(fflatePath));

// ---------- 3. pages ----------
const partials = Object.fromEntries(["head", "header", "footer"].map((n) => [n, read(join(root, `site/src/partials/${n}.html`))]));
const fill = (html, vars) => {
  let s = html.replace(/<!--include:(\w+)-->/g, (_m, n) => partials[n] ?? "");
  for (const [k, v] of Object.entries({ SITE_URL, ...vars })) s = s.split(`{{${k}}}`).join(v);
  return s;
};

// plain assets from site/src (css, js)
for (const f of readdirSync(join(root, "site/src"))) {
  if (/\.(css|js)$/.test(f)) write(f, read(join(root, "site/src", f)));
}

const home = fill(read(join(root, "site/src/index.html")), { DOCS_CURRENT: "" });
write("index.html", home);

// ---------- 4. docs from the Markdown files ----------
const DOCS = [
  { slug: "", file: "docs/quick-start.md", group: "Getting started", label: "Quick start" },
  { slug: "cli", file: "docs/cli.md", group: "Guides", label: "Command line" },
  { slug: "action", file: "docs/action.md", group: "Guides", label: "GitHub Action" },
  { slug: "compatibility", file: "docs/compatibility.md", group: "Reference", label: "Compatibility" },
  { slug: "format-notes", file: "docs/format-notes.md", group: "Reference", label: ".figcraft format notes" },
  { slug: "changelog", file: "CHANGELOG.md", group: "Project", label: "Changelog" },
  { slug: "contributing", file: "CONTRIBUTING.md", group: "Project", label: "Contributing" },
];
const urlOf = (slug) => (slug === "" ? "/docs/" : `/docs/${slug}/`);
const bySource = new Map(DOCS.map((d) => [d.file.split("/").pop(), d]));

/** Point links at other docs pages, and everything else in the repository at GitHub. */
function rewriteLink(href) {
  if (/^(https?:|mailto:|#|\/)/.test(href)) return href;
  const [path, hash = ""] = href.split("#");
  const doc = bySource.get(path.split("/").pop());
  if (doc) return urlOf(doc.slug) + (hash ? `#${hash}` : "");
  const clean = path.replace(/^(\.\.\/|\.\/)+/, "");
  return `${REPO}/blob/main/${clean}${hash ? `#${hash}` : ""}`;
}

const pages = DOCS.map((d) => {
  const md = markdownToHtml(read(join(root, d.file)), { link: rewriteLink });
  const firstPara = (md.html.match(/<p>([\s\S]*?)<\/p>/) ?? [])[1] ?? "";
  const plain = firstPara.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return { ...d, ...md, title: d.slug === "" ? "Quick start" : md.title, description: plain.slice(0, 160) };
});

const sidebar = (current) => {
  const groups = [];
  for (const p of pages) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) groups.push((g = { name: p.group, items: [] }));
    g.items.push(p);
  }
  return groups
    .map((g) => `<div class="group"><span class="group-title">${escapeHtml(g.name)}</span>${g.items.map((p) => `<a href="${urlOf(p.slug)}"${p === current ? ' aria-current="page"' : ""}>${escapeHtml(p.label)}</a>`).join("")}</div>`)
    .join("");
};

const template = read(join(root, "site/src/docs-template.html"));
pages.forEach((p, i) => {
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const prevnext = `<div class="prevnext">${prev ? `<a class="prev" href="${urlOf(prev.slug)}"><small>← Previous</small><span>${escapeHtml(prev.label)}</span></a>` : ""}${next ? `<a class="next" href="${urlOf(next.slug)}"><small>Next →</small><span>${escapeHtml(next.label)}</span></a>` : ""}</div>`;
  const toc = p.headings.length
    ? `<span class="toc-title">On this page</span>${p.headings.map((h) => `<a href="#${h.id}">${escapeHtml(h.text)}</a>`).join("")}`
    : "";
  const html = fill(template, {
    DOCS_CURRENT: ' aria-current="page"',
    TITLE: escapeHtml(p.title),
    DESCRIPTION: escapeHtml(p.description),
    SIDEBAR: sidebar(p),
    CONTENT: p.html,
    PREVNEXT: prevnext,
    TOC: toc,
    EDIT_URL: `${REPO}/edit/main/${p.file}`,
  });
  write(join("docs", p.slug, "index.html"), html);
});

write(
  "search-index.json",
  JSON.stringify(
    pages.map((p) => ({
      url: urlOf(p.slug),
      title: p.title,
      description: p.description,
      headings: p.headings,
      text: p.html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim().slice(0, 6000),
    })),
  ),
);

// ---------- 5. robots, sitemap, headers ----------
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...pages.map((p) => urlOf(p.slug))].map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n")}\n</urlset>\n`,
);

// The import map is an inline script, so the Content-Security-Policy needs its hash.
const importMap = (home.match(/<script type="importmap">([\s\S]*?)<\/script>/) ?? [])[1];
if (!importMap) throw new Error("index.html has no import map");
const hash = createHash("sha256").update(importMap).digest("base64");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${hash}'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
write(
  "_headers",
  `/*\n  Content-Security-Policy: ${csp}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/img/*\n  Cache-Control: public, max-age=86400\n`,
);

// ---------- 6. report ----------
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : files.push(relative(out, p));
  }
})(out);
console.log(`site: ${files.length} files in ${relative(root, out)} (${pages.length} docs pages, ${seen.size} library modules)`);
