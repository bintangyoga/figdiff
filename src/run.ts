import { basename } from "node:path";
import { parseFigcraftFull } from "./parser/index.js";
import { diffTrees } from "./diff/diff.js";
import { diffTokens } from "./diff/tokens.js";
import { summarize } from "./diff/summary.js";
import { formatText } from "./report.js";
import { formatHtml } from "./html.js";
import type { FrameImages } from "./html.js";
import { createCliRenderer, findFigcraftCli, RendererUnavailableError } from "./render/figcraft-cli.js";
import type { Renderer } from "./render/figcraft-cli.js";
import { renderChangedFrames } from "./render/frames.js";
import { extractFromGit } from "./git.js";
import type { GitCopy } from "./git.js";

export const USAGE = `figdiff (pre-alpha)

Usage:
  figdiff <before.figcraft> <after.figcraft> [options]
  figdiff <file.figcraft> --against <git-revision> [options]

Options:
  --against <revision>   Compare the file with its version at a git revision
                         (a branch, tag or commit, for example main or HEAD~1)
  --html <file>          Also write a self-contained HTML report to <file>
  --images               Add rendered before/after images to the HTML report
                         (needs --html and FigCraft's figcraft-cli)
  --scale <number>       Render images at this scale, 0.25 to 4 (default 1; needs --images)
  --figcraft-cli <path>  Path to figcraft-cli (default: $FIGCRAFT_CLI, then PATH)
  --json                 Print summary and changes as JSON instead of text
  --tolerance <number>   Ignore width, height and position changes up to this size, for example 0.5 (default 0)
  --exit-code            Exit with 1 when the files differ (0 when identical)
  --help                 Show this help

Exit codes: 0 ok, 1 differences found (only with --exit-code), 2 error.
`;

export interface FileWrite {
  path: string;
  content: string;
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Files the caller should write (the CLI entry point does this). */
  writes: FileWrite[];
  /** Rendered images per frame (data URIs), when `--images` produced any. */
  frameImages?: Record<string, FrameImages>;
}

/** Things run() needs from the outside world; replaced in tests. */
export interface RunDeps {
  /** Returns a renderer, or undefined when figcraft-cli cannot be found. */
  createRenderer(explicitPath?: string): Renderer | undefined;
  /** Saves the version of a file at a git revision to a temporary file. */
  fromGit(ref: string, file: string): GitCopy;
}

const defaultDeps: RunDeps = {
  createRenderer(explicitPath) {
    const bin = findFigcraftCli(explicitPath);
    return bin ? createCliRenderer(bin) : undefined;
  },
  fromGit: (ref, file) => extractFromGit(ref, file),
};

const BOOLEAN_FLAGS = new Set(["--json", "--exit-code", "--images", "--help"]);
const VALUE_FLAGS = new Set(["--html", "--figcraft-cli", "--against", "--scale", "--tolerance"]);
const MISSING_VALUE: Record<string, string> = {
  "--html": "--html needs a file path",
  "--figcraft-cli": "--figcraft-cli needs a file path",
  "--against": "--against needs a git revision",
  "--scale": "--scale needs a number",
  "--tolerance": "--tolerance needs a number",
};

const fail = (message: string, withUsage = true): RunResult => ({
  code: 2,
  stdout: "",
  stderr: `figdiff: ${message}\n${withUsage ? `\n${USAGE}` : ""}`,
  writes: [],
});

/** Run the CLI. Free of side effects on the file system and process, so it can be tested. */
export function run(argv: string[], overrides: Partial<RunDeps> = {}): RunResult {
  const deps: RunDeps = { ...defaultDeps, ...overrides };
  const files: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) return fail(MISSING_VALUE[arg] as string);
      values.set(arg, value);
    } else if (arg.startsWith("--")) {
      if (!BOOLEAN_FLAGS.has(arg)) return fail(`unknown option ${arg}`);
      flags.add(arg);
    } else {
      files.push(arg);
    }
  }

  if (flags.has("--help")) return { code: 0, stdout: USAGE, stderr: "", writes: [] };
  const against = values.get("--against");
  if (against !== undefined) {
    if (files.length !== 1) return fail("expected one file with --against");
  } else if (files.length !== 2) {
    return fail("expected two files");
  }

  const htmlPath = values.get("--html");
  if (flags.has("--images") && !htmlPath) return fail("--images needs --html");
  if (values.has("--figcraft-cli") && !flags.has("--images")) return fail("--figcraft-cli needs --images");

  let scale = 1;
  if (values.has("--scale")) {
    if (!flags.has("--images")) return fail("--scale needs --images");
    scale = Number(values.get("--scale"));
    if (!Number.isFinite(scale) || scale < 0.25 || scale > 4) return fail("--scale must be a number from 0.25 to 4");
  }

  let tolerance = 0;
  if (values.has("--tolerance")) {
    const raw = values.get("--tolerance") as string;
    tolerance = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(tolerance) || tolerance < 0) return fail("--tolerance must be a number of 0 or more");
  }

  let copy: GitCopy | undefined;
  try {
    let beforePath: string;
    let afterPath: string;
    let beforeName: string;
    if (against !== undefined) {
      afterPath = files[0] as string;
      copy = deps.fromGit(against, afterPath);
      beforePath = copy.path;
      beforeName = `${basename(afterPath)} @ ${against}`;
    } else {
      [beforePath, afterPath] = files as [string, string];
      beforeName = basename(beforePath);
    }
    const beforeDoc = parseFigcraftFull(beforePath);
    const afterDoc = parseFigcraftFull(afterPath);
    const changes = diffTrees(beforeDoc.tree, afterDoc.tree, { tolerance });
    const tokens = diffTokens(beforeDoc.tokens, afterDoc.tokens);
    const stdout = flags.has("--json")
      ? JSON.stringify({ summary: summarize(changes, tokens), changes, tokens }, null, 2) + "\n"
      : formatText(changes, tokens);

    const notes: string[] = [];
    const writes: FileWrite[] = [];
    let images: Record<string, FrameImages> | undefined;
    if (htmlPath) {
      if (flags.has("--images")) {
        const renderer = deps.createRenderer(values.get("--figcraft-cli"));
        if (!renderer) {
          notes.push("figcraft-cli not found; writing the report without images. Use --figcraft-cli <path> or set FIGCRAFT_CLI.");
        } else {
          try {
            const rendered = renderChangedFrames(changes, beforePath, afterPath, renderer, { scale });
            images = rendered.images;
            notes.push(...rendered.warnings);
          } catch (err) {
            if (!(err instanceof RendererUnavailableError)) throw err;
            notes.push(`${err.message}; writing the report without images.`);
          }
        }
      }
      writes.push({
        path: htmlPath,
        content: formatHtml(changes, { beforeName, afterName: basename(afterPath), images, tokens }),
      });
      notes.push(`wrote ${htmlPath}`);
    }

    const code = flags.has("--exit-code") && changes.length + tokens.length > 0 ? 1 : 0;
    return { code, stdout, stderr: notes.map((n) => `figdiff: ${n}\n`).join(""), writes, ...(images ? { frameImages: images } : {}) };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), false);
  } finally {
    copy?.cleanup();
  }
}
