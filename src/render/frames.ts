import type { Change } from "../diff/types.js";
import type { FrameImages } from "../html.js";
import { frameKey } from "../html.js";
import { compareImages } from "./compare.js";
import { decodePng, encodePng } from "./png.js";
import type { Renderer } from "./figcraft-cli.js";

export interface RenderOptions {
  /** Render scale passed to figcraft-cli. Default 1. */
  scale?: number;
  /** Most frames to render, to keep reports small and fast. Default 30. */
  maxFrames?: number;
}

export interface RenderedFrames {
  images: Record<string, FrameImages>;
  warnings: string[];
}

const dataUri = (bytes: Uint8Array): string => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

/**
 * Render every top-level frame that has changes, in both versions, and compare them.
 * A frame missing from one version (added or removed) gets only the image that exists.
 * Throws RendererUnavailableError if figcraft-cli cannot be run at all.
 */
export function renderChangedFrames(
  changes: Change[],
  beforePath: string,
  afterPath: string,
  renderer: Renderer,
  options: RenderOptions = {},
): RenderedFrames {
  const scale = options.scale ?? 1;
  const maxFrames = options.maxFrames ?? 30;
  const warnings: string[] = [];
  const images: Record<string, FrameImages> = {};

  const frames = new Map<string, [string, string]>();
  for (const c of changes) {
    const [page, frame] = c.trail;
    if (page !== undefined && frame !== undefined) frames.set(frameKey(page, frame), [page, frame]);
  }

  let rendered = 0;
  for (const [key, [page, frame]] of frames) {
    if (rendered >= maxFrames) {
      warnings.push(`Rendered ${maxFrames} of ${frames.size} changed frames; the rest have no images.`);
      break;
    }
    rendered++;

    renderer.lastError = undefined;
    const before = renderer.renderFrame(beforePath, page, frame, scale);
    const after = renderer.renderFrame(afterPath, page, frame, scale);
    if (!before && !after) {
      const why = renderer.lastError ? ` figcraft-cli said: ${renderer.lastError}` : "";
      warnings.push(`Could not render frame "${frame}" in either file.${why}`);
      continue;
    }

    const entry: FrameImages = {};
    if (before) entry.before = dataUri(before);
    if (after) entry.after = dataUri(after);
    try {
      const size = decodePng((after ?? before) as Uint8Array);
      entry.width = Math.round(size.width / scale);
    } catch {
      // the size is only a display hint
    }
    if (before && after) {
      try {
        const comparison = compareImages(decodePng(before), decodePng(after));
        entry.diff = dataUri(encodePng(comparison.diff));
        entry.changedRatio = comparison.ratio;
      } catch (err) {
        warnings.push(`Could not compare images of frame "${frame}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    images[key] = entry;
  }

  return { images, warnings };
}
