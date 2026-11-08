#!/usr/bin/env node
import { parseFigcraft } from "./parser/index.js";
import { diffTrees } from "./diff/diff.js";
import { formatText } from "./report.js";

const USAGE = `figdiff (pre-alpha)

Usage:
  figdiff <before.figcraft> <after.figcraft> [--json]

Options:
  --json    Print changes as JSON
  --help    Show this help
`;

function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--")));

  if (flags.has("--help") || args.length !== 2) {
    process.stdout.write(USAGE);
    return flags.has("--help") ? 0 : 2;
  }

  try {
    const [beforePath, afterPath] = args as [string, string];
    const changes = diffTrees(parseFigcraft(beforePath), parseFigcraft(afterPath));
    process.stdout.write(flags.has("--json") ? JSON.stringify(changes, null, 2) + "\n" : formatText(changes));
    return 0;
  } catch (err) {
    process.stderr.write(`figdiff: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
