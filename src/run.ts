import { basename } from "node:path";
import { parseFigcraft } from "./parser/index.js";
import { diffTrees } from "./diff/diff.js";
import { summarize } from "./diff/summary.js";
import { formatText } from "./report.js";
import { formatHtml } from "./html.js";

export const USAGE = `figdiff (pre-alpha)

Usage:
  figdiff <before.figcraft> <after.figcraft> [options]

Options:
  --html <file>  Also write a self-contained HTML report to <file>
  --json         Print summary and changes as JSON instead of text
  --exit-code    Exit with 1 when the files differ (0 when identical)
  --help         Show this help

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

const BOOLEAN_FLAGS = new Set(["--json", "--exit-code", "--help"]);

const fail = (message: string, withUsage = true): RunResult => ({
  code: 2,
  stdout: "",
  stderr: `figdiff: ${message}\n${withUsage ? `\n${USAGE}` : ""}`,
  writes: [],
});

/** Run the CLI. Free of side effects on the file system and process, so it can be tested. */
export function run(argv: string[]): RunResult {
  const files: string[] = [];
  const flags = new Set<string>();
  let htmlPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--html") {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) return fail("--html needs a file path");
      htmlPath = value;
    } else if (arg.startsWith("--")) {
      if (!BOOLEAN_FLAGS.has(arg)) return fail(`unknown option ${arg}`);
      flags.add(arg);
    } else {
      files.push(arg);
    }
  }

  if (flags.has("--help")) return { code: 0, stdout: USAGE, stderr: "", writes: [] };
  if (files.length !== 2) return fail("expected two files");

  try {
    const [beforePath, afterPath] = files as [string, string];
    const changes = diffTrees(parseFigcraft(beforePath), parseFigcraft(afterPath));
    const stdout = flags.has("--json")
      ? JSON.stringify({ summary: summarize(changes), changes }, null, 2) + "\n"
      : formatText(changes);
    const writes: FileWrite[] = htmlPath
      ? [
          {
            path: htmlPath,
            content: formatHtml(changes, { beforeName: basename(beforePath), afterName: basename(afterPath) }),
          },
        ]
      : [];
    const code = flags.has("--exit-code") && changes.length > 0 ? 1 : 0;
    return { code, stdout, stderr: htmlPath ? `figdiff: wrote ${htmlPath}\n` : "", writes };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), false);
  }
}
