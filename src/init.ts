import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FileWrite, RunResult } from "./run.js";

export const INIT_USAGE = `figdiff init: set up a repository so Claude can make design changes and open pull requests

Usage:
  figdiff init [directory] [options]

Writes, in the repository root (default: the current directory):
  .claude/settings.json          runs the hook below when a Claude Code cloud session starts
  .claude/hooks/session-start.sh installs figcraft-cli and figdiff in the session
  CLAUDE.md                      how Claude edits .figcraft files (added to an existing CLAUDE.md)
  .github/workflows/figdiff.yml  comments on pull requests with the changes and images

Existing files are kept: an existing CLAUDE.md gets the figdiff section added once,
an existing .claude/settings.json gets the hook added, and other existing files are skipped.

Options:
  --force   Replace the hook, the workflow and the figdiff section of CLAUDE.md with this
            version's template (your other CLAUDE.md text and settings are kept)
  --help    Show this help
`;

/** Marks the part of CLAUDE.md that figdiff init owns, so a second run finds it. */
export const CLAUDE_MD_START = "<!-- figdiff:start (added by figdiff init; rerun with --force to update) -->";
export const CLAUDE_MD_END = "<!-- figdiff:end -->";

const HOOK_PATH = ".claude/hooks/session-start.sh";
const HOOK_COMMAND = "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh";
const SETTINGS_PATH = ".claude/settings.json";
const CLAUDE_MD_PATH = "CLAUDE.md";
const WORKFLOW_PATH = ".github/workflows/figdiff.yml";

/** The template is examples/claude-designer, shipped inside the npm package. */
export const TEMPLATE_DIR = fileURLToPath(new URL("../examples/claude-designer/", import.meta.url));

export interface InitDeps {
  /** Folder that holds the template files. */
  templateDir: string;
  /** figdiff version to pin in the workflow. */
  version: string;
  readFile(path: string): string | undefined;
  isDirectory(path: string): boolean;
}

function readPackageVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
  return pkg.version ?? "latest";
}

const defaultDeps = (): InitDeps => ({
  templateDir: TEMPLATE_DIR,
  version: readPackageVersion(),
  readFile: (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined),
  isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
});

const initFail = (message: string): RunResult => ({ code: 2, stdout: "", stderr: `figdiff init: ${message}\n\n${INIT_USAGE}`, writes: [] });

interface HookEntry {
  type?: unknown;
  command?: unknown;
}
interface HookGroup {
  hooks?: HookEntry[];
}

/** Adds the SessionStart hook to existing settings. Returns undefined when it is already there. */
export function addSessionHook(existing: string): string | undefined {
  const settings = JSON.parse(existing) as unknown;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) throw new Error("is not a JSON object");
  const root = settings as { hooks?: Record<string, unknown> };
  if (root.hooks !== undefined && (typeof root.hooks !== "object" || root.hooks === null || Array.isArray(root.hooks))) {
    throw new Error('has a "hooks" value that is not an object');
  }
  const hooks = (root.hooks ??= {});
  const current = hooks.SessionStart ?? [];
  if (!Array.isArray(current)) throw new Error('has a "hooks.SessionStart" value that is not a list');
  const groups = current as HookGroup[];
  const present = groups.some(
    (g) => Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === "string" && h.command.includes(HOOK_PATH)),
  );
  if (present) return undefined;
  groups.push({ hooks: [{ type: "command", command: HOOK_COMMAND }] });
  hooks.SessionStart = groups;
  return JSON.stringify(settings, null, 2) + "\n";
}

function claudeSection(template: string): string {
  return `${CLAUDE_MD_START}\n${template.trimEnd()}\n${CLAUDE_MD_END}\n`;
}

/** Pins the workflow to the figdiff version that wrote it, so later releases do not change it unasked. */
export function pinWorkflowVersion(workflow: string, version: string): string {
  return workflow.replace(/^([ \t]*version:[ \t]*)\S+(.*)$/m, `$1${version}$2`);
}

/** `figdiff init`: returns the files to write. Free of side effects, like run(). */
export function init(argv: string[], overrides: Partial<InitDeps> = {}): RunResult {
  let force = false;
  const dirs: string[] = [];
  for (const arg of argv) {
    if (arg === "--help") return { code: 0, stdout: INIT_USAGE, stderr: "", writes: [] };
    if (arg === "--force") force = true;
    else if (arg.startsWith("--")) return initFail(`unknown option ${arg}`);
    else dirs.push(arg);
  }
  if (dirs.length > 1) return initFail("expected at most one directory");

  let deps: InitDeps;
  try {
    deps = { ...defaultDeps(), ...overrides };
  } catch (err) {
    return initFail(`cannot read figdiff's own files: ${err instanceof Error ? err.message : String(err)}`);
  }

  const root = resolve(dirs[0] ?? ".");
  if (!deps.isDirectory(root)) return initFail(`${root} is not a directory`);

  const template = (name: string): string => {
    const content = deps.readFile(join(deps.templateDir, name));
    if (content === undefined) throw new Error(`template file ${name} is missing from this figdiff install`);
    return content;
  };

  const writes: FileWrite[] = [];
  const lines: string[] = [];
  const note = (path: string, what: string) => lines.push(`  ${path.padEnd(32)} ${what}`);
  const at = (path: string) => join(root, path);

  try {
    // .claude/settings.json: create, or add the hook to what is there.
    const settings = deps.readFile(at(SETTINGS_PATH));
    if (settings === undefined) {
      writes.push({ path: at(SETTINGS_PATH), content: template(SETTINGS_PATH) });
      note(SETTINGS_PATH, "created");
    } else {
      let merged: string | undefined;
      try {
        merged = addSessionHook(settings);
      } catch (err) {
        return initFail(
          `${SETTINGS_PATH} ${err instanceof SyntaxError ? "is not valid JSON" : err instanceof Error ? err.message : String(err)}; fix it or add the hook by hand (see docs/claude-designer.md). Nothing was written.`,
        );
      }
      if (merged === undefined) {
        note(SETTINGS_PATH, "already runs the hook, kept");
      } else {
        writes.push({ path: at(SETTINGS_PATH), content: merged });
        note(SETTINGS_PATH, "added the session hook, kept your other settings");
      }
    }

    // .claude/hooks/session-start.sh and the workflow: create, or keep unless --force.
    const plainFiles: [string, string, number | undefined][] = [
      [HOOK_PATH, template(HOOK_PATH), 0o755],
      [WORKFLOW_PATH, pinWorkflowVersion(template(WORKFLOW_PATH), deps.version), undefined],
    ];
    for (const [path, content, mode] of plainFiles) {
      const existing = deps.readFile(at(path));
      if (existing === undefined) {
        writes.push({ path: at(path), content, ...(mode ? { mode } : {}) });
        note(path, "created");
      } else if (existing === content) {
        note(path, "already up to date");
      } else if (force) {
        writes.push({ path: at(path), content, ...(mode ? { mode } : {}) });
        note(path, "replaced (--force)");
      } else {
        note(path, "exists, kept (use --force to replace it)");
      }
    }

    // CLAUDE.md: create, or add the figdiff section once.
    const section = claudeSection(template(CLAUDE_MD_PATH));
    const claudeMd = deps.readFile(at(CLAUDE_MD_PATH));
    if (claudeMd === undefined) {
      writes.push({ path: at(CLAUDE_MD_PATH), content: section });
      note(CLAUDE_MD_PATH, "created");
    } else {
      const start = claudeMd.indexOf(CLAUDE_MD_START);
      const end = start === -1 ? -1 : claudeMd.indexOf(CLAUDE_MD_END, start);
      const firstLine = template(CLAUDE_MD_PATH).split("\n")[0] ?? "";
      if (start !== -1 && end !== -1) {
        const replaced = claudeMd.slice(0, start) + section.trimEnd() + claudeMd.slice(end + CLAUDE_MD_END.length);
        if (replaced === claudeMd) note(CLAUDE_MD_PATH, "figdiff section already up to date");
        else if (force) {
          writes.push({ path: at(CLAUDE_MD_PATH), content: replaced });
          note(CLAUDE_MD_PATH, "replaced the figdiff section (--force), kept the rest");
        } else note(CLAUDE_MD_PATH, "already has the figdiff section, kept (use --force to update it)");
      } else if (firstLine && claudeMd.includes(firstLine)) {
        note(CLAUDE_MD_PATH, "already has the figdiff rules (copied by hand), kept");
      } else {
        const separator = claudeMd.length === 0 || claudeMd.endsWith("\n\n") ? "" : claudeMd.endsWith("\n") ? "\n" : "\n\n";
        writes.push({ path: at(CLAUDE_MD_PATH), content: claudeMd + separator + section });
        note(CLAUDE_MD_PATH, "added the figdiff section at the end, kept the rest");
      }
    }
  } catch (err) {
    return initFail(err instanceof Error ? err.message : String(err));
  }

  const stderr = deps.isDirectory(at(".git")) ? "" : `figdiff init: ${root} has no .git folder; run this in the root of your repository.\n`;
  const next =
    writes.length === 0
      ? "Nothing to change."
      : `Next: commit these files and push them to your default branch, for example:\n  git add .claude CLAUDE.md .github/workflows/figdiff.yml\n  git commit -m "Set up figdiff for design changes from Claude"\n  git push\nThen start a Claude Code cloud session on the repository and ask for a design change.`;
  return { code: 0, stdout: `figdiff init in ${root}\n${lines.join("\n")}\n\n${next}\n`, stderr, writes };
}
