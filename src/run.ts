import { basename } from "node:path";
import { parseFigcraft } from "./parser/index.js";
import { diffTrees } from "./diff/diff.js";
import { summarize } from "./diff/summary.js";
import { formatText } from "./report.js";
import { formatHtml } from "./html.js";
import type { FrameImages } from "./html.js";
import { createCliRenderer, findFigcraftCli, RendererUnavailableError } from "./render/figcraft-cli.js";
import type { Renderer } from "./render/figcraft-cli.js";
import { renderChangedFrames } from "./render/frames.js";

export const USAGE = `figdiff (pre-alpha)

Usage:
  figdiff <before.figcraft> <after.figcraft> [options]

Options:
  --html <file>          Also write a self-contained HTML report to <file>
  --images               Add rendered before/after images to the HTML report
                         (needs --html and FigCraft's figcraft-cli)
  --figcraft-cli <path>  Path to figcraft-cli (default: $FIGCRAFT_CLI, then PATH)
  --json                 Print summary and changes as JSON instead of text
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
}

/** Things run() needs from the outside world; replaced in tests. */
export interface RunDeps {
  /** Returns a renderer, or undefined when figcraft-cli cannot be found. */
  createRenderer(explicitPath?: string): Renderer | undefined;
}

const defaultDeps: RunDeps = {
  createRenderer(explicitPath) {
    const bin = findFigcraftCli(explicitPath);
    return bin ? createCliRenderer(bin) : undefined;
  },
};

const BOOLEAN_FLAGS = new Set(["--json", "--exit-code", "--images", "--help"]);
const VALUE_FLAGS = new Set(["--html", "--figcraft-cli"]);

const fail = (message: string, withUsage = true): RunResult => ({
  code: 2,
  stdout: "",
  stderr: `figdiff: ${message}\n${withUsage ? `\n${USAGE}` : ""}`,
  writes: [],
});

/** Run the CLI. Free of side effects on the file system and process, so it can be tested. */
export function run(argv: string[], deps: RunDeps = defaultDeps): RunResult {
  const files: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) return fail(`${arg} needs a file path`);
      values.set(arg, value);
    } else if (arg.startsWith("--")) {
      if (!BOOLEAN_FLAGS.has(arg)) return fail(`unknown option ${arg}`);
      flags.add(arg);
    } else {
      files.push(arg);
    }
  }

  if (flags.has("--help")) return { code: 0, stdout: USAGE, stderr: "", writes: [] };
  if (files.length !== 2) return fail("expected two files");

  const htmlPath = values.get("--html");
  if (flags.has("--images") && !htmlPath) return fail("--images needs --html");
  if (values.has("--figcraft-cli") && !flags.has("--images")) return fail("--figcraft-cli needs --images");

  try {
    const [beforePath, afterPath] = files as [string, string];
    const changes = diffTrees(parseFigcraft(beforePath), parseFigcraft(afterPath));
    const stdout = flags.has("--json")
      ? JSON.stringify({ summary: summarize(changes), changes }, null, 2) + "\n"
      : formatText(changes);

    const notes: string[] = [];
    const writes: FileWrite[] = [];
    if (htmlPath) {
      let images: Record<string, FrameImages> | undefined;
      if (flags.has("--images")) {
        const renderer = deps.createRenderer(values.get("--figcraft-cli"));
        if (!renderer) {
          notes.push("figcraft-cli not found; writing the report without images. Use --figcraft-cli <path> or set FIGCRAFT_CLI.");
        } else {
          try {
            const rendered = renderChangedFrames(changes, beforePath, afterPath, renderer);
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
        content: formatHtml(changes, { beforeName: basename(beforePath), afterName: basename(afterPath), images }),
      });
      notes.push(`wrote ${htmlPath}`);
    }

    const code = flags.has("--exit-code") && changes.length > 0 ? 1 : 0;
    return { code, stdout, stderr: notes.map((n) => `figdiff: ${n}\n`).join(""), writes };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), false);
  }
}
