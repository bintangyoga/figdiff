import { parseFigcraft } from "./parser/index.js";
import { diffTrees } from "./diff/diff.js";
import { summarize } from "./diff/summary.js";
import { formatText } from "./report.js";

export const USAGE = `figdiff (pre-alpha)

Usage:
  figdiff <before.figcraft> <after.figcraft> [options]

Options:
  --json        Print summary and changes as JSON
  --exit-code   Exit with 1 when the files differ (0 when identical)
  --help        Show this help

Exit codes: 0 ok, 1 differences found (only with --exit-code), 2 error.
`;

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const KNOWN_FLAGS = new Set(["--json", "--exit-code", "--help"]);

/** Run the CLI. Pure with respect to process state, so it can be tested. */
export function run(argv: string[]): RunResult {
  const files = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));

  if (flags.has("--help")) return { code: 0, stdout: USAGE, stderr: "" };

  const unknown = [...flags].filter((f) => !KNOWN_FLAGS.has(f));
  if (unknown.length > 0) {
    return { code: 2, stdout: "", stderr: `figdiff: unknown option ${unknown.join(", ")}\n\n${USAGE}` };
  }
  if (files.length !== 2) {
    return { code: 2, stdout: "", stderr: `figdiff: expected two files\n\n${USAGE}` };
  }

  try {
    const [beforePath, afterPath] = files as [string, string];
    const changes = diffTrees(parseFigcraft(beforePath), parseFigcraft(afterPath));
    const stdout = flags.has("--json")
      ? JSON.stringify({ summary: summarize(changes), changes }, null, 2) + "\n"
      : formatText(changes);
    const code = flags.has("--exit-code") && changes.length > 0 ? 1 : 0;
    return { code, stdout, stderr: "" };
  } catch (err) {
    return { code: 2, stdout: "", stderr: `figdiff: ${err instanceof Error ? err.message : String(err)}\n` };
  }
}
