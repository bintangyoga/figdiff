import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs a program; must throw if it cannot be started or exits with an error. */
export type Exec = (command: string, args: string[]) => void;

export const defaultExec: Exec = (command, args) => {
  execFileSync(command, args, { stdio: ["ignore", "ignore", "pipe"], timeout: 120_000 });
};

/** Runs a program and returns what it printed; must throw if it cannot be started or exits with an error. */
export type ExecOutput = (command: string, args: string[]) => string;

export const defaultExecOutput: ExecOutput = (command, args) =>
  execFileSync(command, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

/** A node's position on the canvas, as figcraft-cli reports it (after auto layout). */
export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The first useful line of what a failed program wrote to stderr, shortened. */
export function errorDetail(err: unknown): string {
  const e = err as { stderr?: Uint8Array | string; message?: string } | null;
  const text = e?.stderr ? String(e.stderr) : (e?.message ?? "");
  const line = text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}

/** Renders one top-level frame of a design file to a PNG. */
export interface Renderer {
  /** Returns the PNG bytes, or undefined when the frame does not exist in that file. */
  renderFrame(file: string, page: string, frame: string, scale: number): Uint8Array | undefined;
  /**
   * Where these nodes are on the canvas, computed by FigCraft (so auto layout is applied). Ids the file does
   * not have must not be passed. Returns an empty map when the positions cannot be read.
   */
  bounds?(file: string, ids: string[]): Map<string, NodeBounds>;
  /** Why the most recent render failed, when the program said. */
  lastError?: string;
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
export function createCliRenderer(bin: string, exec: Exec = defaultExec, execOutput: ExecOutput = defaultExecOutput): Renderer {
  const renderer: Renderer = {
    bounds(file, ids) {
      const out = new Map<string, NodeBounds>();
      if (ids.length === 0) return out;
      const dir = mkdtempSync(join(tmpdir(), "figdiff-bounds-"));
      const script = join(dir, "bounds.json");
      try {
        const steps = ids.map((id) => ({
          command: "node.get",
          params: { id: /^\d+$/.test(id) ? Number(id) : id, depth: 0, fields: ["absoluteBounds"] },
        }));
        writeFileSync(script, JSON.stringify(steps));
        const printed = execOutput(bin, ["run", script, "--in", file]);
        for (const line of printed.split("\n")) {
          if (!line.trim().startsWith("{")) continue;
          let step: { step?: unknown; ok?: unknown; result?: { absoluteBounds?: Partial<NodeBounds> } };
          try {
            step = JSON.parse(line);
          } catch {
            continue;
          }
          const id = typeof step.step === "number" ? ids[step.step] : undefined;
          const b = step.result?.absoluteBounds;
          if (step.ok !== true || id === undefined || !b) continue;
          if ([b.x, b.y, b.width, b.height].every((v) => typeof v === "number" && Number.isFinite(v))) {
            out.set(id, b as NodeBounds);
          }
        }
      } catch (err) {
        renderer.lastError = errorDetail(err);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      return out;
    },
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
            renderer.lastError = errorDetail(err);
          }
        }
        return undefined;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
  return renderer;
}
