#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { run } from "./run.js";

const result = run(process.argv.slice(2));
let code = result.code;
let stderr = result.stderr;

for (const file of result.writes) {
  try {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  } catch (err) {
    stderr = `figdiff: cannot write ${file.path}: ${err instanceof Error ? err.message : String(err)}\n`;
    code = 2;
  }
}

process.stdout.write(result.stdout);
process.stderr.write(stderr);
process.exitCode = code;
