#!/usr/bin/env node
// Clicks through the built site in a real browser: the spot-the-difference game, the in-browser diff on the
// sample files, the filters, the language toggle and the docs search. Serves site/dist with the CSP from
// _headers, so a blocked script fails the run. Needs Playwright with Chromium (npx playwright install chromium).
//
//   node scripts/site-e2e.mjs [site/dist]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(process.argv[2] ?? "site/dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
// The headers for every path ("/*") from _headers, so the browser enforces the real CSP.
const headers = {};
const lines = readFileSync(join(root, "_headers"), "utf8").split("\n");
let inAll = false;
for (const line of lines) {
  if (!line.startsWith(" ") && line.trim()) inAll = line.trim() === "/*";
  else if (inAll && line.includes(":")) headers[line.slice(0, line.indexOf(":")).trim()] = line.slice(line.indexOf(":") + 1).trim();
}

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end("not found");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", ...headers });
  res.end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("request", (r) => !r.url().startsWith(base) && !r.url().startsWith("data:") && errors.push(`outside request: ${r.url()}`));

  // Home: the game
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.click('.fig-a [data-spot="headline"]', { force: true });
  check((await page.textContent("#count"))?.includes("1"), "game counts a found change");
  await page.click("#reveal");
  check(await page.isVisible("#result-eyebrow"), "game reveals the result");

  // Home: compare the sample files in the browser
  await page.click("#use-sample");
  await page.waitForSelector("#report-body:not([hidden])", { timeout: 10_000 });
  const title = (await page.textContent("#report-title")) ?? "";
  check(title.includes("6"), `sample comparison shows 6 changes (got "${title.trim()}")`);
  await page.click('.chip:has-text("Removed")');
  const visibleRows = await page.$$eval("#report .row", (rows) => rows.filter((r) => r.offsetParent !== null).length);
  check(visibleRows === 1, `the Removed filter leaves one change (got ${visibleRows})`);

  // Home: language toggle
  await page.click("#lang-toggle");
  const h1 = ((await page.textContent("h1")) ?? "").replace(/\s+/g, " ");
  check(h1.includes("apa yang berubah"), "the language toggle switches to Bahasa Indonesia");
  check((await page.getAttribute("html", "lang")) === "id", "the page language follows the toggle");
  await page.click("#lang-toggle");
  check(((await page.textContent("h1")) ?? "").includes("what changed"), "the language toggle switches back");

  // Docs: search
  await page.goto(`${base}/docs/cli/`, { waitUntil: "networkidle" });
  await page.fill("#q", "tolerance");
  await page.waitForSelector("#results:not([hidden]) a", { timeout: 5_000 });
  check((await page.$$("#results a")).length > 0, "docs search finds a page");

  // Phone width: no sideways scrolling
  const phone = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 1 });
  for (const path of ["/", "/docs/", "/docs/cli/"]) {
    const p = await phone.newPage();
    await p.goto(`${base}${path}`, { waitUntil: "networkidle" });
    const width = await p.evaluate(() => document.documentElement.scrollWidth);
    check(width <= 360, `${path} fits a 360 px screen (scroll width ${width})`);
  }

  check(errors.length === 0, `no errors or outside requests${errors.length ? `: ${errors.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall browser checks passed");
