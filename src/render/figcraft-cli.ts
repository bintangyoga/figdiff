import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs a program; must throw if it cannot be started or exits with an error. */
export type Exec = (command: string, args: string[]) => void;

export const defaultExec: Exec = (command, args) => {
  execFileSync(command, args, { stdio: "ignore", timeout: 120_000 });
};

/** Renders one top-level frame of a design file to a PNG. */
export interface Renderer {
  /** Returns the PNG bytes, or undefined when the frame does not exist in that file. */
  renderFrame(file: string, page: string, frame: string, scale: number): Uint8Array | undefined;
}

/** Thrown when figcraft-cli itself cannot be run, as opposed to a frame that is missing. */
export class RendererUnavailableError extends Error {}

const isNotFound = (err: unknown): boolean => (err as { code?: string } | null)?.code === "ENOENT";

/**
 * Locate figcraft-cli. An explicit path wins; otherwise the FIGCRAFT_CLI environment
 * variable, then `figcraft-cli` on the PATH. Returns undefined when it cannot be started.
 */
export function findFigcraftCli(
  explicit?: string,
  exec: Exec = defaultExec,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const candidates = explicit ? [explicit] : [env.FIGCRAFT_CLI, "figcraft-cli"];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      exec(candidate, ["--help"]);
      return candidate;
    } catch (err) {
      // Exists but did not like --help: still usable. Only "not found" rules it out.
      if (!isNotFound(err)) return candidate;
    }
  }
  return undefined;
}

/**
 * Renderer backed by `figcraft-cli export`. The frame is selected by name; when the page
 * is also passed and the CLI rejects that combination, it retries with the name alone.
 */
export function createCliRenderer(bin: string, exec: Exec = defaultExec): Renderer {
  return {
    renderFrame(file, page, frame, scale) {
      const dir = mkdtempSync(join(tmpdir(), "figdiff-render-"));
      const out = join(dir, "frame.png");
      try {
        const base = ["export", file, "-o", out, "--format", "png", "--scale", String(scale)];
        for (const selector of [["--page", page, "--node", frame], ["--node", frame]]) {
          try {
            exec(bin, [...base, ...selector]);
            return new Uint8Array(readFileSync(out));
          } catch (err) {
            if (isNotFound(err)) throw new RendererUnavailableError(`Cannot run ${bin}`);
            // Otherwise: this selector did not work, or the frame is not in this file.
          }
        }
        return undefined;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
