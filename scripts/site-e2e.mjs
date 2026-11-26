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
  // Like the Worker in worker/index.js: every /gh/<owner>/<repo>/... address is the /gh/ page.
  if (path.startsWith("/gh/")) file = join(root, "gh", "index.html");
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
  check(title.includes("4"), `sample comparison shows 4 changes (got "${title.trim()}")`);
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

  // GitHub pages: the real page and scripts, with a pretend GitHub API (no real network).
  {
    const before = readFileSync(join(root, "samples/ridgeline-before.figcraft"));
    const after = readFileSync(join(root, "samples/ridgeline-after.figcraft"));
    const cors = { "access-control-allow-origin": "*", "access-control-expose-headers": "x-ratelimit-remaining,x-ratelimit-reset" };
    const json = (body, status = 200, extra = {}) => ({
      status,
      headers: { ...cors, "content-type": "application/json", ...extra },
      body: JSON.stringify(body),
    });
    const ghContext = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
    const apiCalls = [];
    let limited = false;
    await ghContext.route("https://api.github.com/**", (route) => {
      const url = new URL(route.request().url());
      const p = decodeURIComponent(url.pathname);
      apiCalls.push(p + url.search);
      if (limited)
        return route.fulfill(json({ message: "rate limit" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" }));
      if (p === "/repos/acme/app") return route.fulfill(json({ default_branch: "main", private: false, full_name: "acme/app" }));
      if (p === "/repos/acme/app/git/trees/main") {
        return route.fulfill(
          json({
            truncated: false,
            tree: [
              { type: "blob", path: "design/home.figcraft", size: before.length },
              { type: "blob", path: "README.md", size: 10 },
            ],
          }),
        );
      }
      if (p === "/repos/acme/app/pulls/7") {
        return route.fulfill(
          json({
            title: "<b>New</b> headline",
            state: "open",
            user: { login: "bo" },
            base: { sha: "aaa11100", ref: "main" },
            head: { sha: "bbb22200", ref: "edit" },
          }),
        );
      }
      if (p === "/repos/acme/app/compare/aaa11100...bbb22200" || p === "/repos/acme/app/compare/main...edit") {
        return route.fulfill(
          json({
            ahead_by: 1,
            files: [
              { filename: "design/home.figcraft", status: "modified" },
              { filename: "design/other.figcraft", status: "added" },
              { filename: "notes.txt", status: "added" },
            ],
          }),
        );
      }
      if (p === "/repos/acme/app/contents/design/home.figcraft") {
        const ref = url.searchParams.get("ref");
        const body = ref === "aaa11100" || ref === "main" ? before : after;
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/octet-stream" }, body });
      }
      return route.fulfill(json({ message: "Not Found" }, 404));
    });
    // raw.githubusercontent.com: the manifest and pictures the Action saved ("none" = the Action was not used).
    let pics = "none";
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const rawCalls = [];
    await ghContext.route("https://raw.githubusercontent.com/**", (route) => {
      const p = decodeURIComponent(new URL(route.request().url()).pathname);
      rawCalls.push(p);
      const dir = "/acme/app/figdiff-assets/pr-7/bbb22200";
      if (pics === "none") return route.fulfill({ status: 404, headers: cors, body: "404: Not Found" });
      if (p === `${dir}/manifest.json`) {
        const frame =
          pics === "good"
            ? {
                page: "Onboarding",
                frame: "1 Welcome",
                changedRatio: 0.125,
                before: "pr-7/bbb22200/f0-0-before.png",
                after: "pr-7/bbb22200/f0-0-after.png",
              }
            : { page: "P", frame: "F", before: "../../x.png", after: "https://evil.example/x.png" };
        return route.fulfill(
          json({
            version: 1,
            pr: 7,
            head: "bbb22200ffffffffffffffffffffffffffffffff",
            files: [{ path: "design/home.figcraft", frames: [frame] }],
          }),
        );
      }
      if (p.startsWith(`${dir}/`) && p.endsWith(".png"))
        return route.fulfill({ status: 200, headers: { ...cors, "content-type": "image/png" }, body: png });
      return route.fulfill({ status: 404, headers: cors, body: "" });
    });
    const gp = await ghContext.newPage();
    const ghErrors = [];
    gp.on("pageerror", (e) => ghErrors.push(String(e)));
    gp.on("console", (m) => m.type() === "error" && !/status of (403|404)/.test(m.text()) && ghErrors.push(m.text()));

    await gp.goto(`${base}/gh/`, { waitUntil: "networkidle" });
    await gp.fill("#gh-input", "https://github.com/acme/app/pull/7/files");
    await Promise.all([gp.waitForURL("**/gh/acme/app/pull/7"), gp.press("#gh-input", "Enter")]);
    await gp.waitForSelector(".gh-card .gh-summary", { timeout: 10_000 });
    check((await gp.textContent(".gh-summary"))?.includes("4 changes"), "a pull request shows the changes of its design file");
    check((await gp.$$(".gh-card .row")).length === 4, "the pull request lists four change rows");
    check((await gp.$$(".gh-frame svg.wf")).length > 0, "changed frames are drawn as wireframes");
    check((await gp.$$(".wf rect[stroke='#ed731a']")).length > 0, "changed layers are outlined in orange on the wireframe");
    check(
      (await gp.textContent("#gh-title"))?.includes("<b>New</b> headline") === true,
      "a pull request title is shown as text, not as HTML",
    );
    check((await gp.$$("#gh-out b")).length === 0, "no markup from GitHub data is rendered");

    // With pictures saved by the Action: they replace the wireframes
    pics = "good";
    await gp.goto(`${base}/gh/acme/app/pull/7`, { waitUntil: "networkidle" });
    await gp.waitForSelector(".gh-pic img");
    const srcs = await gp.$$eval(".gh-pic img", (i) => i.map((x) => x.src));
    check(
      srcs.length === 2 && srcs.every((u) => u.startsWith("https://raw.githubusercontent.com/acme/app/figdiff-assets/pr-7/bbb22200/")),
      "saved pictures load from raw.githubusercontent.com",
    );
    check(
      (await gp.$$eval(".gh-pic img", (i) => i.every((x) => x.complete && x.naturalWidth > 0))) === true,
      "the pictures are allowed by the page's security policy and load",
    );
    check((await gp.$$(".gh-card svg.wf")).length === 0, "pictures replace the wireframes");
    check(((await gp.textContent(".gh-pic figcaption")) ?? "").includes("12.5%"), "the changed share of pixels is shown");
    pics = "bad";
    await gp.goto(`${base}/gh/acme/app/pull/7`, { waitUntil: "networkidle" });
    await gp.waitForSelector(".gh-card .gh-summary");
    check(
      (await gp.$$(".gh-pic img")).length === 0 && (await gp.$$(".gh-card svg.wf")).length > 0,
      "a manifest with unsafe paths is ignored and wireframes are shown",
    );
    pics = "none";

    await gp.goto(`${base}/gh/acme/app`, { waitUntil: "networkidle" });
    await gp.waitForSelector(".gh-files a");
    check(
      (await gp.$$eval(".gh-files a", (a) => a.map((x) => x.textContent))).join() === "design/home.figcraft",
      "the repository page lists only .figcraft files",
    );
    await gp.fill("#gh-head", "edit");
    await Promise.all([gp.waitForURL("**/compare/main...edit"), gp.click(".gh-compare button")]);
    await gp.waitForSelector(".gh-card .gh-summary", { timeout: 10_000 });
    check((await gp.$$(".gh-card")).length === 2, "a compare link lists the changed .figcraft files and skips other files");

    await gp.goto(`${base}/gh/acme/app/blob/main/design/home.figcraft`, { waitUntil: "networkidle" });
    await gp.waitForSelector(".gh-frame svg.wf");
    check((await gp.$$(".gh-frame")).length >= 2, "a single design shows its frames");

    await gp.goto(`${base}/gh/acme/missing`, { waitUntil: "networkidle" });
    check(((await gp.textContent(".gh-msg.error")) ?? "").includes("does not exist"), "a missing repository gets a plain message");
    await gp.goto(`${base}/gh/acme/app/pull/zero`, { waitUntil: "networkidle" });
    check(((await gp.textContent("#gh-out")) ?? "").includes("Use /pull/<number>"), "a bad address is explained");
    limited = true;
    await gp.goto(`${base}/gh/acme/app`, { waitUntil: "networkidle" });
    check(((await gp.textContent(".gh-msg.error")) ?? "").includes("60 requests an hour"), "the rate limit is explained");
    check(
      apiCalls.every((c) => c.startsWith("/repos/acme/")),
      "only the requested repository is read from the API",
    );
    check(ghErrors.length === 0, `the GitHub pages report no errors${ghErrors.length ? `: ${ghErrors.join(" | ")}` : ""}`);

    const gpm = await phone.newPage();
    await gpm.goto(`${base}/gh/`, { waitUntil: "networkidle" });
    check((await gpm.evaluate(() => document.documentElement.scrollWidth)) <= 360, "/gh/ fits a 360 px screen");
    await ghContext.close();
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
