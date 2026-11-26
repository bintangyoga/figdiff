import { compareFigcraft, parseFigcraftBytes, formatSummary } from "/lib/browser.js";
import { renderRows, toRows } from "/report-rows.js";
import { createClient, GitHubError, rawUrl } from "/gh-api.js";
import { isRef, parseRoute, routeFromInput, routeUrl } from "/gh-route.js";
import { drawFrame, framesWithIds } from "/wireframe.js";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const link = (href, text, cls) => {
  const a = el("a", cls, text);
  a.href = href;
  return a;
};

const gh = createClient();
const out = $("#gh-out");
const AUTO_OPEN = 3; // changed files compared without a click
const MAX_FRAMES = 6;

function setTitle(text, sub) {
  $("#gh-title").textContent = text;
  $("#gh-sub").textContent = sub ?? "";
  document.title = `${text} · figdiff`;
}

const message = (text, kind = "info") => {
  const p = el("p", `gh-msg ${kind}`, text);
  p.setAttribute("role", kind === "error" ? "alert" : "status");
  return p;
};

function describe(err) {
  if (err instanceof GitHubError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// ---------- start page ----------
function home() {
  setTitle(
    "Look at a design on GitHub",
    "Paste a repository, a pull request or a compare link. Nothing is uploaded: your browser reads the files straight from GitHub.",
  );
  const form = el("form", "gh-form");
  form.setAttribute("novalidate", "");
  const label = el("label", "sr-only", "GitHub repository or address");
  label.htmlFor = "gh-input";
  const input = el("input");
  input.id = "gh-input";
  input.type = "text";
  input.placeholder = "owner/repo, or github.com/owner/repo/pull/12";
  input.autocomplete = "off";
  input.spellcheck = false;
  const go = el("button", "btn btn-primary", "Open");
  go.type = "submit";
  const err = message("", "error");
  err.hidden = true;
  form.append(label, input, go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const r = routeFromInput(input.value);
    if (!r) {
      err.textContent = "That does not look like a GitHub repository, pull request or compare address.";
      err.hidden = false;
      return;
    }
    location.assign(routeUrl(r));
  });
  const notes = el("ul", "gh-notes");
  for (const t of [
    "Public repositories only for now. Private repositories need a login, which is planned.",
    "GitHub allows 60 requests an hour without logging in. A pull request with one design uses about 4.",
    "The pictures here are wireframes drawn from the file. For real images, add the figdiff GitHub Action to the repository.",
  ])
    notes.append(el("li", "", t));
  const ex = el("p", "gh-example");
  ex.append("Try it: ", link("/gh/bintangyoga/figdiff-demo", "bintangyoga/figdiff-demo"), ".");
  out.replaceChildren(form, err, ex, notes);
}

// ---------- a repository ----------
async function repoView(r) {
  setTitle(`${r.owner}/${r.repo}`, "Loading…");
  out.replaceChildren(message("Reading the repository…"));
  const info = await gh.repo(r.owner, r.repo);
  const ref = r.ref ?? info.defaultBranch;
  const { files, truncated } = await gh.figcraftFiles(r.owner, r.repo, ref);
  setTitle(info.fullName, `${files.length} .figcraft file${files.length === 1 ? "" : "s"} at ${ref}`);
  const box = el("div");
  box.append(repoLinks(r, "repo"));

  if (files.length === 0) box.append(message("No .figcraft files at this branch."));
  else {
    const list = el("ul", "gh-files");
    for (const f of files) {
      const li = el("li");
      li.append(
        link(routeUrl({ view: "blob", owner: r.owner, repo: r.repo, ref, path: f.path }), f.path),
        el("span", "muted", ` ${formatBytes(f.size)}`),
      );
      list.append(li);
    }
    box.append(list);
  }
  if (truncated) box.append(message("GitHub cut this list short because the repository is very large.", "warn"));

  const form = el("form", "gh-form gh-compare");
  form.setAttribute("novalidate", "");
  const a = field("Base", "gh-base", info.defaultBranch);
  const b = field("Compare", "gh-head", "");
  b.input.placeholder = "branch, tag or commit";
  const go = el("button", "btn btn-ghost", "Compare");
  go.type = "submit";
  const err = message("", "error");
  err.hidden = true;
  form.append(a.label, a.input, b.label, b.input, go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const rr = routeFromInput(`github.com/${r.owner}/${r.repo}/compare/${a.input.value.trim()}...${b.input.value.trim()}`);
    if (!rr) {
      err.textContent = "Type two branches, tags or commits.";
      err.hidden = false;
      return;
    }
    location.assign(routeUrl(rr));
  });
  box.append(el("h2", "gh-h", "Compare two versions"), form, err);
  out.replaceChildren(box);
}

function field(text, id, value) {
  const label = el("label", "gh-label", text);
  label.htmlFor = id;
  const input = el("input");
  input.id = id;
  input.type = "text";
  input.value = value;
  input.autocomplete = "off";
  input.spellcheck = false;
  return { label, input };
}

function repoLinks(r, current) {
  const nav = el("p", "gh-links");
  nav.append(link(`https://github.com/${r.owner}/${r.repo}`, "View on GitHub"));
  if (current !== "repo") nav.append(" · ", link(routeUrl({ view: "repo", owner: r.owner, repo: r.repo }), "All designs"));
  return nav;
}

// ---------- one design ----------
async function blobView(r) {
  setTitle(r.path.split("/").pop(), `${r.owner}/${r.repo} at ${r.ref}`);
  out.replaceChildren(message("Reading the file…"));
  const bytes = await gh.file(r.owner, r.repo, r.path, r.ref);
  const { tree } = parseFigcraftBytes(bytes, r.path);
  const box = el("div");
  box.append(repoLinks(r, "blob"));
  const frames = tree.children.flatMap((page) => page.children.map((frame) => ({ page, frame })));
  if (frames.length === 0) box.append(message("This file has no frames."));
  box.append(wireframes(frames.slice(0, MAX_FRAMES), new Set()));
  if (frames.length > MAX_FRAMES) box.append(message(`Showing the first ${MAX_FRAMES} of ${frames.length} frames.`, "warn"));
  box.append(wireNote());
  out.replaceChildren(box);
}

function wireNote(hint = false) {
  const p = el("p", "gh-note", "These are wireframes drawn from the file: boxes, outlines and text, without fonts, images or effects.");
  if (hint)
    p.append(
      " For real pictures, add ",
      el("code", "", "images: true"),
      " and ",
      el("code", "", "host-images: true"),
      " to the figdiff Action. ",
      link("/docs/github/#pictures", "How"),
    );
  return p;
}

/** Before, after and difference pictures that the Action saved on a branch of the repository. */
function pictures(r, branch, frames) {
  const row = el("div", "gh-pics");
  for (const fr of frames.slice(0, MAX_FRAMES)) {
    const fig = el("figure", "gh-pic");
    const name = `${fr.page} › ${fr.frame}`;
    const set = el("div", "gh-pic-set");
    for (const [kind, label] of [
      ["before", "Before"],
      ["after", "After"],
      ["diff", "Difference"],
    ]) {
      if (!fr[kind]) continue;
      const cell = el("div", "gh-pic-cell");
      const img = el("img");
      img.src = rawUrl(r.owner, r.repo, branch, fr[kind]);
      img.alt = `${label}: ${name}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      cell.append(el("span", "gh-pic-label", label), img);
      set.append(cell);
    }
    const pct = typeof fr.changedRatio === "number" ? ` · ${(fr.changedRatio * 100).toFixed(1)}% of the pixels changed` : "";
    fig.append(set, el("figcaption", "", `${name}${pct}`));
    row.append(fig);
  }
  return row;
}

function wireframes(frames, highlight) {
  const row = el("div", "gh-frames");
  for (const { page, frame } of frames) {
    const fig = el("figure", "gh-frame");
    const svg = drawFrame(frame, { highlight });
    fig.append(svg, el("figcaption", "", `${page.name} › ${frame.name}`));
    row.append(fig);
  }
  return row;
}

// ---------- two versions ----------
async function compareView(r, baseRef, headRef, heading, pics = null) {
  out.replaceChildren(message("Looking for changed designs…"));
  const { files } = await gh.changedFiles(r.owner, r.repo, baseRef, headRef);
  setTitle(heading, `${r.owner}/${r.repo}: ${files.length} changed .figcraft file${files.length === 1 ? "" : "s"}`);
  const box = el("div");
  box.append(repoLinks(r, "compare"));
  if (files.length === 0) box.append(message("No .figcraft file differs between these two versions."));
  files.forEach((f, i) => box.append(fileCard(r, f, baseRef, headRef, i < AUTO_OPEN, pics)));
  if (files.length > 0)
    box.append(
      pics
        ? el("p", "gh-note", "The pictures were rendered by FigCraft in the pull request's GitHub Action.")
        : wireNote(r.view === "pull"),
    );
  out.replaceChildren(box);
}

function fileCard(r, f, baseRef, headRef, open, pics) {
  const card = el("section", "gh-card");
  const head = el("div", "gh-card-head");
  head.append(
    el("span", `gh-status ${f.status}`, f.status),
    el("span", "gh-path", f.previousPath && f.previousPath !== f.path ? `${f.previousPath} → ${f.path}` : f.path),
  );
  const body = el("div", "gh-card-body");
  card.append(head, body);
  if (f.status === "added") {
    body.append(message("A new design. Open it to see it."));
    body.append(link(routeUrl({ view: "blob", owner: r.owner, repo: r.repo, ref: headRef, path: f.path }), "Open the new file"));
  } else if (f.status === "removed") body.append(message("This design was removed."));
  else {
    const run = async () => {
      body.replaceChildren(message("Comparing…"));
      try {
        body.replaceChildren(await diffBody(r, f, baseRef, headRef, pics));
      } catch (err) {
        body.replaceChildren(message(describe(err), "error"));
      }
    };
    if (open) run();
    else {
      const b = el("button", "btn btn-ghost btn-sm", "Show changes");
      b.type = "button";
      b.addEventListener("click", run);
      body.append(b);
    }
  }
  return card;
}

async function diffBody(r, f, baseRef, headRef, pics) {
  const [before, after] = await Promise.all([
    gh.file(r.owner, r.repo, f.previousPath ?? f.path, baseRef),
    gh.file(r.owner, r.repo, f.path, headRef),
  ]);
  const result = compareFigcraft(before, after, {
    beforeName: `${f.previousPath ?? f.path} (${baseRef})`,
    afterName: `${f.path} (${headRef})`,
  });
  const wrap = el("div");
  const total = result.summary.changes + (result.summary.tokenChanges ?? 0);
  wrap.append(
    el("p", "gh-summary", total === 0 ? "No changes. These two versions describe the same design." : formatSummary(result.summary)),
  );
  if (total === 0) return wrap;

  const ids = new Set(result.changes.map((c) => c.id));
  const saved = pics?.map.get(f.path);
  const frames = saved ? [] : framesWithIds(parseFigcraftBytes(after, f.path).tree, ids);
  if (saved) {
    wrap.append(el("h3", "gh-h", "Before, after and what differs"));
    wrap.append(pictures(r, pics.branch, saved));
  } else if (frames.length > 0) {
    wrap.append(el("h3", "gh-h", "Where it changed (outlined in orange)"));
    wrap.append(wireframes(frames.slice(0, MAX_FRAMES), ids));
    if (frames.length > MAX_FRAMES) wrap.append(message(`Showing the first ${MAX_FRAMES} of ${frames.length} changed frames.`, "warn"));
  }
  const rows = el("div", "report-rows");
  renderRows(rows, toRows(result));
  wrap.append(el("h3", "gh-h", "Changes"), rows);
  return wrap;
}

// ---------- start ----------
async function main() {
  const r = parseRoute(location.pathname, location.search);
  try {
    if (r.view === "home") return home();
    if (r.view === "invalid") {
      setTitle("This address does not work");
      out.replaceChildren(message(r.message, "error"), link("/gh/", "Start again"));
      return;
    }
    if (r.view === "repo") return await repoView(r);
    if (r.view === "blob") return await blobView(r);
    if (r.view === "compare") return await compareView(r, r.base, r.head, `${r.base}…${r.head}`);
    if (r.view === "pull") {
      setTitle(`Pull request #${r.number}`, `${r.owner}/${r.repo}`);
      out.replaceChildren(message("Reading the pull request…"));
      const p = await gh.pull(r.owner, r.repo, r.number);
      const asked = new URLSearchParams(location.search).get("assets");
      const branch = asked && isRef(asked) ? asked : "figdiff-assets";
      const map = await gh.pullImages(r.owner, r.repo, branch, r.number, p.headSha);
      return await compareView(r, p.baseSha, p.headSha, `#${r.number} ${p.title}`.slice(0, 120), map ? { map, branch } : null);
    }
  } catch (err) {
    setTitle(`${location.pathname.replace(/^\/gh\//, "")}`.slice(0, 80) || "Error");
    out.replaceChildren(message(describe(err), "error"), link("/gh/", "Start again"));
  }
}

function formatBytes(n) {
  if (!n) return "";
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

main();
