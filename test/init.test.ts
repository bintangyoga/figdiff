import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addSessionHook, CLAUDE_MD_END, CLAUDE_MD_START, init, pinWorkflowVersion, TEMPLATE_DIR } from "../src/init.js";
import type { InitDeps } from "../src/init.js";
import { run, USAGE } from "../src/run.js";
import type { RunResult } from "../src/run.js";

const ROOT = resolve("/repo");

/** A pretend repository: paths relative to ROOT mapped to their content. */
function deps(files: Record<string, string>, { git = true } = {}): Partial<InitDeps> {
  return {
    version: "9.9.9",
    readFile(path) {
      if (path.startsWith(TEMPLATE_DIR)) return readFileSync(path, "utf8");
      const rel = path.slice(ROOT.length + 1);
      return files[rel];
    },
    isDirectory: (path) => path === ROOT || (git && path === join(ROOT, ".git")),
  };
}

const written = (r: RunResult) => Object.fromEntries(r.writes.map((w) => [w.path.slice(ROOT.length + 1), w]));
const template = (name: string) => readFileSync(join(TEMPLATE_DIR, name), "utf8");

describe("figdiff init", () => {
  it("writes all four files into an empty repository", () => {
    const r = init([ROOT], deps({}));
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
    const w = written(r);
    expect(Object.keys(w).sort()).toEqual([
      ".claude/hooks/session-start.sh",
      ".claude/settings.json",
      ".github/workflows/figdiff.yml",
      "CLAUDE.md",
    ]);
    expect(w[".claude/settings.json"]?.content).toBe(template(".claude/settings.json"));
    expect(w[".claude/hooks/session-start.sh"]?.content).toBe(template(".claude/hooks/session-start.sh"));
    expect(w[".claude/hooks/session-start.sh"]?.mode).toBe(0o755);
    expect(w[".github/workflows/figdiff.yml"]?.content).toContain("version: 9.9.9");
    const md = w["CLAUDE.md"]?.content ?? "";
    expect(md.startsWith(CLAUDE_MD_START)).toBe(true);
    expect(md).toContain("# Design repository: instructions for Claude");
    expect(md.trimEnd().endsWith(CLAUDE_MD_END)).toBe(true);
    expect(r.stdout).toContain("Next: commit these files");
  });

  it("adds the figdiff section to an existing CLAUDE.md once", () => {
    const first = init([ROOT], deps({ "CLAUDE.md": "# My app\n\nUse pnpm.\n" }));
    const md = written(first)["CLAUDE.md"]?.content ?? "";
    expect(md.startsWith("# My app\n\nUse pnpm.\n\n" + CLAUDE_MD_START)).toBe(true);
    expect(first.stdout).toContain("added the figdiff section at the end");

    const second = init([ROOT], deps({ "CLAUDE.md": md }));
    expect(written(second)["CLAUDE.md"]).toBeUndefined();
    expect(second.stdout).toContain("figdiff section already up to date");
  });

  it("keeps a figdiff section that was edited, unless --force", () => {
    const md = `# My app\n\n${CLAUDE_MD_START}\nold rules\n${CLAUDE_MD_END}\n\nMore of my notes.\n`;
    const kept = init([ROOT], deps({ "CLAUDE.md": md }));
    expect(written(kept)["CLAUDE.md"]).toBeUndefined();
    expect(kept.stdout).toContain("use --force to update it");

    const forced = written(init([ROOT, "--force"], deps({ "CLAUDE.md": md })))["CLAUDE.md"]?.content ?? "";
    expect(forced.startsWith("# My app\n\n" + CLAUDE_MD_START)).toBe(true);
    expect(forced).not.toContain("old rules");
    expect(forced).toContain("# Design repository: instructions for Claude");
    expect(forced.endsWith(`${CLAUDE_MD_END}\n\nMore of my notes.\n`)).toBe(true);
  });

  it("does not add the rules again to a CLAUDE.md copied by hand", () => {
    const r = init([ROOT], deps({ "CLAUDE.md": template("CLAUDE.md") }));
    expect(written(r)["CLAUDE.md"]).toBeUndefined();
    expect(r.stdout).toContain("copied by hand");
  });

  it("adds the hook to existing settings and keeps the rest", () => {
    const existing = JSON.stringify({
      permissions: { allow: ["Bash(pnpm *)"] },
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "echo hi" }] }], Stop: [] },
    });
    const merged = JSON.parse(written(init([ROOT], deps({ ".claude/settings.json": existing })))[".claude/settings.json"]?.content ?? "");
    expect(merged.permissions).toEqual({ allow: ["Bash(pnpm *)"] });
    expect(merged.hooks.Stop).toEqual([]);
    expect(merged.hooks.SessionStart).toHaveLength(2);
    expect(merged.hooks.SessionStart[1].hooks[0].command).toBe("$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh");
  });

  it("leaves settings alone when the hook is already there", () => {
    expect(addSessionHook(template(".claude/settings.json"))).toBeUndefined();
    const r = init([ROOT], deps({ ".claude/settings.json": template(".claude/settings.json") }));
    expect(written(r)[".claude/settings.json"]).toBeUndefined();
    expect(r.stdout).toContain("already runs the hook");
  });

  it("writes nothing when the settings are not valid JSON", () => {
    const r = init([ROOT], deps({ ".claude/settings.json": "{ not json" }));
    expect(r.code).toBe(2);
    expect(r.writes).toEqual([]);
    expect(r.stderr).toContain("is not valid JSON");
    expect(init([ROOT], deps({ ".claude/settings.json": '{"hooks": []}' })).stderr).toContain("not an object");
  });

  it("keeps an existing hook and workflow unless --force", () => {
    const files = { ".claude/hooks/session-start.sh": "#!/bin/sh\necho mine\n", ".github/workflows/figdiff.yml": "name: mine\n" };
    const kept = init([ROOT], deps(files));
    expect(written(kept)[".claude/hooks/session-start.sh"]).toBeUndefined();
    expect(written(kept)[".github/workflows/figdiff.yml"]).toBeUndefined();
    expect(kept.stdout).toContain("exists, kept (use --force to replace it)");

    const forced = written(init([ROOT, "--force"], deps(files)));
    expect(forced[".claude/hooks/session-start.sh"]?.content).toBe(template(".claude/hooks/session-start.sh"));
    expect(forced[".claude/hooks/session-start.sh"]?.mode).toBe(0o755);
    expect(forced[".github/workflows/figdiff.yml"]?.content).toContain("version: 9.9.9");
  });

  it("changes nothing on a second run", () => {
    const files: Record<string, string> = {};
    for (const w of init([ROOT], deps({})).writes) files[w.path.slice(ROOT.length + 1)] = w.content;
    const again = init([ROOT, "--force"], deps(files));
    expect(again.writes).toEqual([]);
    expect(again.stdout).toContain("Nothing to change.");
  });

  it("warns outside the root of a git repository", () => {
    expect(init([ROOT], deps({}, { git: false })).stderr).toContain("has no .git folder");
  });

  it("rejects unknown options, extra arguments and missing folders", () => {
    expect(init(["--yes"], deps({})).stderr).toContain("unknown option --yes");
    expect(init(["a", "b"], deps({})).stderr).toContain("at most one directory");
    expect(init(["/nowhere"], deps({})).stderr).toContain("is not a directory");
  });

  it("pins the workflow to a version", () => {
    expect(pinWorkflowVersion("  with:\n    version: 0.1.0\n    images: true\n", "1.2.3")).toBe(
      "  with:\n    version: 1.2.3\n    images: true\n",
    );
  });

  it("is reachable from the main command and its help", () => {
    expect(run(["init", "--help"]).stdout).toContain("figdiff init [directory]");
    expect(USAGE).toContain("figdiff init");
  });

  it("pins the version from package.json by default", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    const { version: _ignored, ...rest } = deps({});
    void _ignored;
    const r = init([ROOT], rest);
    expect(written(r)[".github/workflows/figdiff.yml"]?.content).toContain(`version: ${pkg.version}`);
  });
});
