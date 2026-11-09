import type { Image } from "./png.js";

export interface Comparison {
  width: number;
  height: number;
  changedPixels: number;
  totalPixels: number;
  /** changedPixels / totalPixels, from 0 to 1. */
  ratio: number;
  /** Faded copy of the new image with changed pixels in solid red. */
  diff: Image;
}

const HIGHLIGHT = [255, 45, 85, 255] as const;

/**
 * Compare two images pixel by pixel. If sizes differ, the comparison canvas is the larger of
 * the two, and any area covered by only one image counts as changed.
 *
 * `tolerance` is the largest per-channel difference (0 to 255) still treated as unchanged,
 * which absorbs anti-aliasing noise.
 */
export function compareImages(before: Image, after: Image, tolerance = 8): Comparison {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const out = new Uint8Array(width * height * 4);
  let changed = 0;

  const read = (img: Image, x: number, y: number): number | undefined =>
    x < img.width && y < img.height ? (y * img.width + x) * 4 : undefined;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = read(before, x, y);
      const b = read(after, x, y);
      const o = (y * width + x) * 4;

      let isChanged: boolean;
      if (a === undefined || b === undefined) {
        isChanged = a !== b;
      } else {
        isChanged = false;
        for (let c = 0; c < 4; c++) {
          if (Math.abs((before.data[a + c] as number) - (after.data[b + c] as number)) > tolerance) {
            isChanged = true;
            break;
          }
        }
      }

      if (isChanged) {
        changed++;
        out.set(HIGHLIGHT, o);
      } else if (b !== undefined) {
        // Unchanged: show the pixel faded to 25% over white so the changes stand out.
        const alpha = (after.data[b + 3] as number) / 255;
        for (let c = 0; c < 3; c++) {
          const over = (after.data[b + c] as number) * alpha + 255 * (1 - alpha);
          out[o + c] = Math.round(255 - (255 - over) * 0.25);
        }
        out[o + 3] = 255;
      } else {
        out.set([255, 255, 255, 255], o);
      }
    }
  }

  const totalPixels = width * height;
  return {
    width,
    height,
    changedPixels: changed,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : changed / totalPixels,
    diff: { width, height, data: out },
  };
}
