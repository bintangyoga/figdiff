import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** A copy of an old file version on disk, to be removed with `cleanup()`. */
export interface GitCopy {
  path: string;
  cleanup(): void;
}

/** Runs git and returns what it printed to stdout; must throw on failure. */
export type GitRun = (args: string[], cwd: string) => Uint8Array;

const defaultGit: GitRun = (args, cwd) =>
  execFileSync("git", args, { cwd, maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

/**
 * Save the version of `file` found at git revision `ref` (a branch, tag or commit) to a
 * temporary file, so it can be compared with the working copy.
 */
export function extractFromGit(ref: string, file: string, git: GitRun = defaultGit): GitCopy {
  if (ref.startsWith("-")) throw new Error(`Invalid git revision "${ref}"`);
  const absolute = resolve(file);
  const name = basename(absolute);

  let content: Uint8Array;
  try {
    // "<ref>:./<name>" is resolved relative to the directory git runs in.
    content = git(["show", `${ref}:./${name}`], dirname(absolute));
  } catch (err) {
    const e = err as { code?: string; stderr?: Uint8Array | string };
    if (e.code === "ENOENT") throw new Error("git was not found. Install git to use --against.");
    const detail = String(e.stderr ?? "")
      .trim()
      .split("\n")[0];
    throw new Error(`Cannot read ${name} at "${ref}"${detail ? `: ${detail}` : ""}`);
  }

  const dir = mkdtempSync(join(tmpdir(), "figdiff-git-"));
  const path = join(dir, name);
  writeFileSync(path, content);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
