#!/usr/bin/env node
// figdiff for GitLab merge requests.
//
// Copy this file to .gitlab/figdiff-gitlab.mjs in your design repository, next to the job in
// examples/gitlab-ci/.gitlab-ci.yml. In a merge request pipeline it compares every changed
// .figcraft file with the merge request's base, writes HTML reports, and keeps one note on the
// merge request up to date. It needs Node.js 20 or later and the figdiff npm package installed in
// FIGDIFF_HOME (the job does both). Settings come from environment variables, see docs/gitlab.md.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Hidden marker used to find our own note again on later pushes. */
export const MARKER = "<!-- figdiff-comment -->";

/** GitLab accepts notes up to 1,000,000 characters; stay far below so the merge request stays readable. */
const MAX_NOTE = 100_000;
const MAX_FILE_TEXT = 15_000;

// ---------------------------------------------------------------------------------------------
// Changed files

/** Glob to regular expression: `*` stays inside a folder, `**` crosses folders, `?` is one character. */
export function globToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") {
          i++;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (c === "?") {
      source += "[^/]";
    } else {
      source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/** Split "design/**\/*.figcraft, other/*.figcraft" (commas or new lines) into patterns. */
export function parsePatterns(input) {
  return input
    .split(/[\n,]/)
    .map((p) => p.trim().replace(/^\.\//, ""))
    .filter((p) => p.length > 0);
}

/** Parse `git diff --name-status -z --no-renames`. */
export function parseNameStatus(output) {
  const tokens = output.split("\0");
  const files = [];
  for (let i = 0; i < tokens.length; i++) {
    const code = tokens[i];
    if (code === "") continue;
    const kind = code[0];
    if (kind === "R" || kind === "C") {
      const oldPath = tokens[++i];
      const path = tokens[++i];
      files.push(kind === "R" ? { status: "renamed", path, oldPath } : { status: "added", path });
    } else {
      const path = tokens[++i];
      files.push({ status: kind === "A" ? "added" : kind === "D" ? "deleted" : "modified", path });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------------------------
// The note

/** Wrap text in a code span whose delimiter cannot be broken by backticks inside. */
function code(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text}${fence}`;
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const kept = cut.slice(0, Math.max(cut.lastIndexOf("\n"), 0));
  const hidden = text.slice(kept.length).split("\n").filter(Boolean).length;
  return `${kept}\n\n… ${hidden} more lines not shown`;
}

/** A file counts unless it was only saved again without any design difference. */
export function isSubstantive(r) {
  if (r.error) return true;
  if (r.file.status !== "modified") return true;
  return (r.summary?.changes ?? 0) > 0;
}

/** Text inside a Markdown table cell. */
const cell = (t) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ");

function frameTable(frames) {
  const rows = ["| Before | After | Difference |", "| --- | --- | --- |"];
  for (const f of frames) {
    const pct =
      f.changedRatio === undefined ? "" : f.changedRatio < 0.001 ? " (<0.1% changed)" : ` (${(f.changedRatio * 100).toFixed(1)}% changed)`;
    rows.push(`| **${cell(f.name)}**${pct} | | |`);
    rows.push(`| ${f.before ?? "_none_"} | ${f.after ?? "_none_"} | ${f.diff ?? "_none_"} |`);
  }
  return rows.join("\n");
}

function section(r) {
  const name = code(r.file.path);
  if (r.file.status === "added") return `**${name}**: new design file, nothing earlier to compare with.`;
  if (r.file.status === "deleted") return `**${name}**: design file deleted.`;
  if (r.error) return `**${name}**: could not be compared. ${r.error}`;
  if (!isSubstantive(r)) return `**${name}**: saved again, no design changes.`;
  const images = r.frames && r.frames.length > 0 ? `\n\n${frameTable(r.frames)}` : "";
  const details = r.markdown
    ? `\n\n<details><summary>Show changes</summary>\n\n${truncate(r.markdown.trimEnd(), MAX_FILE_TEXT)}\n\n</details>`
    : "";
  return `**${name}**: ${r.summaryText}${images}${details}`;
}

/** The merge request note for a set of compared files. */
export function buildNote(results, { reportsUrl, version } = {}) {
  const parts = [`${MARKER}\n## Design changes`, ...results.map(section)];
  if (reportsUrl && results.some((r) => r.reportName)) {
    parts.push(`Full HTML reports are in the [job artifacts](${reportsUrl}), in the folder **figdiff-reports**.`);
  }
  parts.push(`<sub>Generated by figdiff${version ? ` ${version}` : ""} for GitLab. Changes are matched by node id.</sub>`);
  const body = parts.join("\n\n");
  return body.length <= MAX_NOTE ? body : `${body.slice(0, MAX_NOTE)}\n\n… (note shortened)`;
}

/** Replaces an earlier note when a later push no longer changes any design file. */
export function buildEmptyNote() {
  return `${MARKER}\n## Design changes\n\nThis merge request no longer changes any design file.`;
}

// ---------------------------------------------------------------------------------------------
// GitLab API

export class GitLabError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(api, method, path, body) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await api.fetch(`${api.baseUrl}${path}`, {
    method,
    headers: {
      "private-token": api.token,
      "user-agent": "figdiff-gitlab",
      ...(body === undefined || isForm ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data.message === "string" ? data.message : JSON.stringify(data.message ?? data.error ?? "");
    } catch {
      // the error body was not JSON
    }
    throw new GitLabError(
      `GitLab API ${method} ${path.replace(/\?.*$/, "")} failed with ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }
  return res.status === 204 ? undefined : res.json();
}

/** Find the note figdiff wrote earlier on this merge request. */
export async function findNote(api, project, iid) {
  for (let page = 1; page <= 20; page++) {
    const notes = await request(api, "GET", `/projects/${project}/merge_requests/${iid}/notes?per_page=100&page=${page}&sort=asc`);
    const found = notes.find((n) => !n.system && typeof n.body === "string" && n.body.includes(MARKER));
    if (found) return found.id;
    if (notes.length < 100) return undefined;
  }
  return undefined;
}

/** Update the earlier note, or create one, so a merge request only ever has one. */
export async function upsertNote(api, project, iid, body, existing) {
  if (existing !== undefined) {
    try {
      await request(api, "PUT", `/projects/${project}/merge_requests/${iid}/notes/${existing}`, { body });
      return "updated";
    } catch (err) {
      // The note may belong to another user (for example after the token was replaced).
      if (!(err instanceof GitLabError) || (err.status !== 403 && err.status !== 404)) throw err;
    }
  }
  await request(api, "POST", `/projects/${project}/merge_requests/${iid}/notes`, { body });
  return "created";
}

/** Upload one picture to the project's uploads and return Markdown that shows it. */
export async function uploadImage(api, project, name, bytes) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), name);
  const res = await request(api, "POST", `/projects/${project}/uploads`, form);
  // `url` is project-relative (/uploads/...), which GitLab resolves in notes of the same project.
  const url = res.url ?? res.full_path;
  if (!url) throw new GitLabError("GitLab did not return a URL for the uploaded image", 500);
  return `![${name}](${url}){width=220}`;
}

function decodePngDataUri(uri) {
  const m = /^data:image\/png;base64,(.+)$/.exec(uri ?? "");
  return m ? Buffer.from(m[1], "base64") : undefined;
}

// ---------------------------------------------------------------------------------------------
// The job

function setting(env, name, fallback) {
  const v = env[name];
  return v !== undefined && v.trim() !== "" ? v.trim() : fallback;
}

const defaultDeps = {
  git: (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
  writeText: (p, c) => writeFileSync(p, c),
  mkdirp: (p) => void mkdirSync(p, { recursive: true }),
  fetch: (...a) => fetch(...a),
  async loadFigdiff(home) {
    return import(pathToFileURL(join(home, "node_modules", "figdiff", "dist", "index.js")).href);
  },
};

/** Compare one modified file with its version at the base commit. */
function compareFile(file, root, base, reportDir, figdiff, deps, log, extra) {
  const reportName = `${file.path.replace(/[^A-Za-z0-9._-]+/g, "_")}.html`;
  const result = figdiff.run([join(root, file.path), "--against", base, "--json", "--html", join(reportDir, reportName), ...extra]);
  if (result.code !== 0) {
    const message =
      result.stderr
        .replace(/^figdiff:\s*/gm, "")
        .trim()
        .split("\n")[0] || "unknown error";
    return { file, error: message };
  }
  for (const line of result.stderr.split("\n"))
    if (line.trim() && !line.startsWith("figdiff: wrote ")) log.push(`${file.path}: ${line.replace(/^figdiff:\s*/, "")}`);
  for (const w of result.writes) {
    deps.mkdirp(reportDir);
    deps.writeText(w.path, w.content);
  }
  const parsed = JSON.parse(result.stdout);
  const tokens = parsed.tokens ?? [];
  return {
    file,
    summary: parsed.summary,
    summaryText: figdiff.formatSummary(parsed.summary),
    markdown: figdiff.formatMarkdown(parsed.changes, tokens).replace(/^\*\*.*\*\*\n\n?/, ""),
    text: figdiff.formatText(parsed.changes, tokens),
    reportName,
    raw: result.frameImages,
  };
}

/** Upload the rendered frames of the changed files and link them from the note. */
async function uploadFrames(api, project, results, log) {
  let count = 0;
  try {
    for (const [i, r] of results.entries()) {
      if (!r.raw) continue;
      const frames = [];
      for (const [j, [key, img]] of Object.entries(r.raw).entries()) {
        const [page, frame] = key.split("\u0000");
        const link = { name: `${page ?? ""} › ${frame ?? ""}`, changedRatio: img.changedRatio };
        for (const kind of ["before", "after", "diff"]) {
          const bytes = decodePngDataUri(img[kind]);
          if (!bytes) continue;
          link[kind] = await uploadImage(api, project, `figdiff-${i}-${j}-${kind}.png`, bytes);
          count++;
        }
        frames.push(link);
      }
      r.frames = frames;
    }
    if (count > 0) log.push(`figdiff: ${count} image(s) uploaded to the project.`);
  } catch (err) {
    for (const r of results) r.frames = undefined;
    log.push(`figdiff: images were not added to the note: ${err instanceof Error ? err.message : String(err)}.`);
  }
}

/** Run the job. Everything it needs comes in through `env` and `deps`, so it can be tested. */
export async function main(env, overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const log = [];
  const done = (code, extra = {}) => ({ code, log, changed: 0, ...extra });

  const iid = env.CI_MERGE_REQUEST_IID;
  const base = env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
  if (!iid || !base) {
    log.push(
      'figdiff: this is not a merge request pipeline; nothing to do. Run the job with rules: if: $CI_PIPELINE_SOURCE == "merge_request_event".',
    );
    return done(0, { note: "skipped" });
  }
  const head = setting(env, "CI_COMMIT_SHA", "HEAD");
  const root = setting(env, "CI_PROJECT_DIR", process.cwd());
  const patterns = parsePatterns(setting(env, "FIGDIFF_FILES", "**/*.figcraft"));
  const reportDir = join(root, setting(env, "FIGDIFF_REPORT_DIR", "figdiff-reports"));
  const wantNote = setting(env, "FIGDIFF_COMMENT", "true") !== "false";
  const withImages = setting(env, "FIGDIFF_IMAGES", "false") === "true";
  const scale = setting(env, "FIGDIFF_SCALE", "");
  const tolerance = setting(env, "FIGDIFF_TOLERANCE", "");
  const maxFiles = Math.max(1, Number.parseInt(setting(env, "FIGDIFF_MAX_FILES", "20"), 10) || 20);
  const extra = [
    ...(withImages ? ["--images", ...(scale ? ["--scale", scale] : [])] : []),
    ...(tolerance ? ["--tolerance", tolerance] : []),
  ];

  let figdiff;
  try {
    figdiff = overrides.figdiff ?? (await deps.loadFigdiff(setting(env, "FIGDIFF_HOME", "/tmp/figdiff")));
  } catch {
    log.push('figdiff: could not load the figdiff package. Install it first: npm install --prefix "$FIGDIFF_HOME" figdiff');
    return done(2);
  }

  let listed;
  try {
    listed = parseNameStatus(deps.git(["diff", "--name-status", "-z", "--no-renames", `${base}...${head}`], root));
  } catch {
    log.push("figdiff: could not list the changed files. Set GIT_DEPTH: 0 on the job so the base commit is available.");
    return done(2);
  }
  const files = listed.filter((f) => patterns.some((p) => globToRegExp(p).test(f.path)));
  log.push(`figdiff: ${files.length} design file(s) changed in this merge request.`);

  const results = [];
  for (const file of files.slice(0, maxFiles)) {
    results.push(file.status === "modified" ? compareFile(file, root, base, reportDir, figdiff, deps, log, extra) : { file });
  }
  if (files.length > maxFiles) log.push(`figdiff: only the first ${maxFiles} files were compared (FIGDIFF_MAX_FILES).`);
  const changed = results.filter(isSubstantive);
  for (const r of results) log.push(`figdiff: ${r.file.path}: ${r.error ?? r.summary?.changes ?? r.file.status}`);
  const printChanges = () => {
    for (const r of changed) log.push(`${r.file.path}:\n${r.text ?? r.error ?? r.file.status}`);
  };

  if (!wantNote) {
    printChanges();
    return done(0, { note: "skipped", changed: changed.length });
  }
  const token = env.FIGDIFF_GITLAB_TOKEN;
  // In a fork, the pipeline runs in the fork but the merge request lives in the target project.
  const project = env.CI_MERGE_REQUEST_PROJECT_ID ?? env.CI_PROJECT_ID;
  if (!token || !project) {
    log.push(
      "figdiff: FIGDIFF_GITLAB_TOKEN is not available (not set, or protected and this branch is not), so no note was posted. The changes are below.",
    );
    printChanges();
    return done(0, { note: "skipped", changed: changed.length });
  }

  const api = { fetch: deps.fetch, baseUrl: setting(env, "CI_API_V4_URL", "https://gitlab.com/api/v4"), token };
  try {
    if (withImages) await uploadFrames(api, project, changed, log);
    const existing = await findNote(api, project, iid);
    if (changed.length === 0 && existing === undefined) {
      log.push("figdiff: no design changes and no earlier note; staying quiet.");
      return done(0, { note: "skipped" });
    }
    const reportsUrl = env.CI_JOB_URL ? `${env.CI_JOB_URL}/artifacts/browse` : undefined;
    const body = changed.length === 0 ? buildEmptyNote() : buildNote(changed, { reportsUrl, version: env.FIGDIFF_VERSION });
    const outcome = await upsertNote(api, project, iid, body, existing);
    log.push(`figdiff: note ${outcome}.`);
    return done(0, { note: outcome, changed: changed.length });
  } catch (err) {
    if (err instanceof GitLabError && (err.status === 401 || err.status === 403)) {
      log.push(
        `figdiff: the token is not allowed to comment (${err.status}). Use a project access token with the api scope and at least the Reporter role. The changes are below.`,
      );
      printChanges();
      return done(0, { note: "skipped", changed: changed.length });
    }
    log.push(`figdiff: ${err instanceof Error ? err.message : String(err)}`);
    return done(2, { changed: changed.length });
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  // Show the version that is installed, not the one asked for (which may be "latest").
  try {
    const home = setting(process.env, "FIGDIFF_HOME", "/tmp/figdiff");
    process.env.FIGDIFF_VERSION = JSON.parse(readFileSync(join(home, "node_modules", "figdiff", "package.json"), "utf8")).version;
  } catch {}
  const result = await main(process.env);
  for (const line of result.log) console.log(line);
  process.exitCode = result.code;
}
