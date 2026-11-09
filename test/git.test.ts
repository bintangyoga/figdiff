import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { extractFromGit } from "../src/git.js";
import type { GitRun } from "../src/git.js";
import { run } from "../src/run.js";
import { makeFigcraft } from "./helpers.js";

describe("extractFromGit (with a stand-in git)", () => {
  it("asks git for <ref>:./<name> from the file's own directory", () => {
    let seen: { args: string[]; cwd: string } | undefined;
    const git: GitRun = (args, cwd) => { seen = { args, cwd }; return new Uint8Array([1, 2, 3]); };
    const copy = extractFromGit("main", join(tmpdir(), "design", "app.figcraft"), git);
    expect(seen).toEqual({ args: ["show", "main:./app.figcraft"], cwd: join(tmpdir(), "design") });
    expect(Array.from(readFileSync(copy.path))).toEqual([1, 2, 3]);
    copy.cleanup();
    expect(existsSync(copy.path)).toBe(false);
  });

  it("rejects revisions that look like options", () => {
    expect(() => extractFromGit("--output=/tmp/x", "a.figcraft", () => new Uint8Array())).toThrow(/Invalid git revision/);
  });

  it("explains when the file does not exist at that revision", () => {
    const git: GitRun = () => { throw Object.assign(new Error("exit 128"), { stderr: "fatal: path 'a.figcraft' does not exist in 'v9'\nmore" }); };
    expect(() => extractFromGit("v9", "a.figcraft", git)).toThrow(`Cannot read a.figcraft at "v9": fatal: path 'a.figcraft' does not exist in 'v9'`);
  });

  it("explains when git is not installed", () => {
    const git: GitRun = () => { throw Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }); };
    expect(() => extractFromGit("main", "a.figcraft", git)).toThrow(/git was not found/);
  });
});

describe("--against with a real git repository", () => {
  let repo = "";
  let file = "";

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
      cwd: repo,
      stdio: "pipe",
    });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "figdiff-repo-"));
    file = join(repo, "app.figcraft");
    git("init", "-q");
    writeFileSync(file, makeFigcraft(0.2));
    git("add", "app.figcraft");
    git("commit", "-q", "-m", "first");
    writeFileSync(file, makeFigcraft(1, true)); // working copy differs from HEAD
  });

  it("extracts the committed version byte for byte", () => {
    const copy = extractFromGit("HEAD", file);
    expect(Array.from(readFileSync(copy.path))).toEqual(Array.from(makeFigcraft(0.2)));
    copy.cleanup();
  });

  it("compares the working copy with HEAD", () => {
    const r = run([file, "--against", "HEAD"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("~ Button: fills #330000 → #FF0000");
    expect(r.stdout).toContain("+ Hint (text)");
  });

  it("names the old side after the revision in the HTML report", () => {
    const r = run([file, "--against", "HEAD", "--html", join(repo, "r.html")]);
    expect(r.writes[0]?.content).toContain("app.figcraft @ HEAD");
  });

  it("reports an unknown revision", () => {
    const r = run([file, "--against", "no-such-branch"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('Cannot read app.figcraft at "no-such-branch"');
  });

  it("reports a file that is not tracked", () => {
    const other = join(repo, "new.figcraft");
    writeFileSync(other, makeFigcraft(0.5));
    const r = run([other, "--against", "HEAD"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Cannot read new.figcraft");
  });
});
