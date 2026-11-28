import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-ignore: a plain JavaScript file that people copy into their GitLab repository
import { buildNote, main, MARKER, parseNameStatus } from "../examples/gitlab-ci/figdiff-gitlab.mjs";
import * as figdiff from "../src/index.js";
import { makeFigcraft } from "./helpers.js";

type Call = { method: string; url: string; body?: unknown; headers?: Record<string, string> };

/** A stand-in for the GitLab REST API that records every call. */
function fakeGitLab(opts: { notes?: { id: number; body: string; system?: boolean }[]; put?: number; post?: number } = {}) {
  const calls: Call[] = [];
  let uploads = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body, headers: init?.headers as Record<string, string> });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (url.includes("/uploads")) {
      uploads++;
      return json({ url: `/uploads/abc${uploads}/f.png`, full_path: `/-/project/1/uploads/abc${uploads}/f.png` }, 201);
    }
    if (method === "GET") return json(opts.notes ?? []);
    if (method === "PUT") return opts.put ? json({ message: "403 Forbidden" }, opts.put) : json({ id: 5 });
    return opts.post ? json({ message: "401 Unauthorized" }, opts.post) : json({ id: 99 }, 201);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const bodyOf = (c: Call | undefined) => JSON.parse(String(c?.body ?? "{}")).body as string;

describe("GitLab CI script", () => {
  let repo = "";
  let base = "";
  let head = "";
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "figdiff-gitlab-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    mkdirSync(join(repo, "design"));
    writeFileSync(join(repo, "design/app.figcraft"), makeFigcraft(1));
    writeFileSync(join(repo, "design/old.figcraft"), makeFigcraft(1));
    writeFileSync(join(repo, "notes.md"), "a");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    base = git("rev-parse", "HEAD");
    writeFileSync(join(repo, "design/app.figcraft"), makeFigcraft(0.5, true));
    writeFileSync(join(repo, "design/new.figcraft"), makeFigcraft(1));
    git("rm", "-q", "design/old.figcraft");
    writeFileSync(join(repo, "notes.md"), "b");
    git("add", ".");
    git("commit", "-q", "-m", "change");
    head = git("rev-parse", "HEAD");
  });

  const env = (extra: Record<string, string> = {}) => ({
    CI_MERGE_REQUEST_IID: "7",
    CI_MERGE_REQUEST_DIFF_BASE_SHA: base,
    CI_COMMIT_SHA: head,
    CI_PROJECT_DIR: repo,
    CI_PROJECT_ID: "42",
    CI_API_V4_URL: "https://gitlab.test/api/v4",
    CI_JOB_URL: "https://gitlab.test/g/p/-/jobs/1",
    FIGDIFF_GITLAB_TOKEN: "glpat-test",
    FIGDIFF_VERSION: "0.1.0",
    ...extra,
  });
  const deps = (f: typeof fetch) => ({ fetch: f, figdiff });

  it("parses renames and copies like the Action does", () => {
    expect(parseNameStatus("M\0a.figcraft\0R100\0x.figcraft\0y.figcraft\0C90\0p.figcraft\0q.figcraft\0")).toEqual([
      { status: "modified", path: "a.figcraft" },
      { status: "renamed", path: "y.figcraft", oldPath: "x.figcraft" },
      { status: "added", path: "q.figcraft" },
    ]);
  });

  it("creates one note with the changes, the new and the deleted file", async () => {
    const gl = fakeGitLab();
    const r = await main(env({ FIGDIFF_REPORT_DIR: "reports-1" }), deps(gl.f));
    expect(r.code).toBe(0);
    expect(r.note).toBe("created");
    const post = gl.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://gitlab.test/api/v4/projects/42/merge_requests/7/notes");
    expect(post?.headers?.["private-token"]).toBe("glpat-test");
    const body = bodyOf(post);
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("`design/app.figcraft`**: 2 changes in 1 frame");
    expect(body).toContain("Hint");
    expect(body).toContain("<details><summary>Show changes</summary>");
    expect(body).toContain("`design/new.figcraft`**: new design file");
    expect(body).toContain("`design/old.figcraft`**: design file deleted");
    expect(body).not.toContain("notes.md");
    expect(body).toContain("[job artifacts](https://gitlab.test/g/p/-/jobs/1/artifacts/browse)");
    expect(body).toContain("figdiff 0.1.0 for GitLab");
    expect(existsSync(join(repo, "reports-1", "design_app.figcraft.html"))).toBe(true);
  });

  it("updates its earlier note instead of adding another", async () => {
    const gl = fakeGitLab({
      notes: [
        { id: 3, body: `changed the description ${MARKER}`, system: true },
        { id: 5, body: `${MARKER}\nold` },
      ],
    });
    const r = await main(env({ FIGDIFF_REPORT_DIR: "reports-2" }), deps(gl.f));
    expect(r.note).toBe("updated");
    expect(gl.calls.some((c) => c.method === "PUT" && c.url.endsWith("/projects/42/merge_requests/7/notes/5"))).toBe(true);
    expect(gl.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("adds a new note when the earlier one cannot be edited", async () => {
    const gl = fakeGitLab({ notes: [{ id: 5, body: MARKER }], put: 403 });
    const r = await main(env({ FIGDIFF_REPORT_DIR: "reports-3" }), deps(gl.f));
    expect(r.note).toBe("created");
  });

  it("posts to the target project of a merge request from a fork", async () => {
    const gl = fakeGitLab();
    await main(env({ CI_MERGE_REQUEST_PROJECT_ID: "9", FIGDIFF_REPORT_DIR: "reports-4" }), deps(gl.f));
    expect(gl.calls.find((c) => c.method === "POST")?.url).toContain("/projects/9/merge_requests/7/notes");
  });

  it("stays quiet when no design file matches and there is no earlier note", async () => {
    const gl = fakeGitLab();
    const r = await main(env({ FIGDIFF_FILES: "nothing/*.figcraft" }), deps(gl.f));
    expect(r.note).toBe("skipped");
    expect(gl.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("replaces its earlier note when the design changes are gone", async () => {
    const gl = fakeGitLab({ notes: [{ id: 5, body: MARKER }] });
    await main(env({ FIGDIFF_FILES: "nothing/*.figcraft" }), deps(gl.f));
    expect(bodyOf(gl.calls.find((c) => c.method === "PUT"))).toContain("no longer changes any design file");
  });

  it("prints the changes instead of failing when there is no token or it may not comment", async () => {
    const none = await main(env({ FIGDIFF_GITLAB_TOKEN: "", FIGDIFF_REPORT_DIR: "reports-5" }), deps(fakeGitLab().f));
    expect(none.code).toBe(0);
    expect(none.log.join("\n")).toContain("FIGDIFF_GITLAB_TOKEN is not available");
    expect(none.log.join("\n")).toContain("Hint");

    const denied = await main(env({ FIGDIFF_REPORT_DIR: "reports-6" }), deps(fakeGitLab({ post: 401 }).f));
    expect(denied.code).toBe(0);
    expect(denied.log.join("\n")).toContain("not allowed to comment (401)");
  });

  it("does nothing outside merge request pipelines", async () => {
    const gl = fakeGitLab();
    const r = await main({ CI_PROJECT_DIR: repo }, deps(gl.f));
    expect(r.code).toBe(0);
    expect(gl.calls).toHaveLength(0);
  });

  it("explains a shallow clone", async () => {
    const r = await main(env({ CI_MERGE_REQUEST_DIFF_BASE_SHA: "0".repeat(40) }), deps(fakeGitLab().f));
    expect(r.code).toBe(2);
    expect(r.log.join("\n")).toContain("GIT_DEPTH: 0");
  });

  it("uploads frame images to the project and shows them in the note", async () => {
    const png = `data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString("base64")}`;
    const seen: string[][] = [];
    const fakeFigdiff = {
      ...figdiff,
      run: (argv: string[]) => {
        seen.push(argv);
        const r = figdiff.run(argv.filter((a, i) => a !== "--images" && a !== "--scale" && argv[i - 1] !== "--scale"));
        return { ...r, frameImages: { "Screens\u0000Login": { before: png, after: png, diff: png, changedRatio: 0.25 } } };
      },
    };
    const gl = fakeGitLab();
    const r = await main(env({ FIGDIFF_IMAGES: "true", FIGDIFF_SCALE: "2", FIGDIFF_REPORT_DIR: "reports-7" }), {
      fetch: gl.f,
      figdiff: fakeFigdiff,
    });
    expect(seen[0]).toContain("--images");
    expect(seen[0]).toContain("--scale");
    const uploads = gl.calls.filter((c) => c.url.endsWith("/projects/42/uploads"));
    expect(uploads).toHaveLength(3);
    expect(uploads[0]?.body).toBeInstanceOf(FormData);
    const body = bodyOf(gl.calls.find((c) => c.method === "POST" && c.url.endsWith("/notes")));
    expect(body).toContain("| Before | After | Difference |");
    expect(body).toContain("**Screens › Login** (25.0% changed)");
    expect(body).toContain("](/uploads/abc1/f.png){width=220}");
    expect(r.log.join("\n")).toContain("3 image(s) uploaded");
  });

  it("keeps the note when image uploads are refused", async () => {
    const png = `data:image/png;base64,${Buffer.from([1]).toString("base64")}`;
    const fakeFigdiff = { ...figdiff, run: (argv: string[]) => ({ ...figdiff.run(argv), frameImages: { "a\u0000b": { before: png } } }) };
    const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/uploads")) return new Response(JSON.stringify({ message: "403 Forbidden" }), { status: 403 });
      return new Response(JSON.stringify((init?.method ?? "GET") === "GET" ? [] : { id: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await main(env({ FIGDIFF_IMAGES: "true", FIGDIFF_REPORT_DIR: "reports-8" }), { fetch: f, figdiff: fakeFigdiff });
    expect(r.note).toBe("created");
    expect(r.log.join("\n")).toContain("images were not added to the note");
  });

  it("shortens very long notes", () => {
    const summary = { changes: 1, frames: 1, added: 0, removed: 0, moved: 0, reordered: 0, modifiedNodes: 1, propertyChanges: 1 };
    const markdown = "- ✏️ a line\n".repeat(30_000);
    const body = buildNote([{ file: { status: "modified", path: "a.figcraft" }, summary, summaryText: "1 change", markdown }]);
    expect(body.length).toBeLessThan(110_000);
    expect(body).toContain("more lines not shown");
  });

  it("is listed in the GitLab template", () => {
    const yml = readFileSync(join(__dirname, "../examples/gitlab-ci/.gitlab-ci.yml"), "utf8");
    expect(yml).toContain("node .gitlab/figdiff-gitlab.mjs");
    expect(yml).toContain('GIT_DEPTH: "0"');
    expect(yml).toContain("sha256sum --check");
  });
});
