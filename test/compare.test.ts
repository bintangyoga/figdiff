import { describe, expect, it } from "vitest";
import { compareImages } from "../src/render/compare.js";
import { solid } from "./helpers.js";

describe("compareImages", () => {
  it("finds no change between identical images", () => {
    const r = compareImages(solid(4, 4, [10, 20, 30, 255]), solid(4, 4, [10, 20, 30, 255]));
    expect(r.changedPixels).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.totalPixels).toBe(16);
  });

  it("counts and highlights changed pixels", () => {
    const after = solid(4, 4, [10, 20, 30, 255]);
    after.data.set([200, 20, 30, 255], 0); // first pixel
    after.data.set([10, 20, 200, 255], (3 * 4 + 3) * 4); // last pixel
    const r = compareImages(solid(4, 4, [10, 20, 30, 255]), after);
    expect(r.changedPixels).toBe(2);
    expect(r.ratio).toBeCloseTo(2 / 16);
    expect(Array.from(r.diff.data.slice(0, 4))).toEqual([255, 45, 85, 255]);
    // Unchanged pixels are faded toward white, not red.
    expect(r.diff.data[4 * 5]).toBeGreaterThan(190);
  });

  it("ignores differences within the tolerance", () => {
    const after = solid(2, 2, [14, 20, 30, 255]);
    expect(compareImages(solid(2, 2, [10, 20, 30, 255]), after, 8).changedPixels).toBe(0);
    expect(compareImages(solid(2, 2, [10, 20, 30, 255]), after, 2).changedPixels).toBe(4);
  });

  it("treats area covered by only one image as changed when sizes differ", () => {
    const r = compareImages(solid(2, 2, [0, 0, 0, 255]), solid(4, 2, [0, 0, 0, 255]));
    expect(r.width).toBe(4);
    expect(r.height).toBe(2);
    expect(r.changedPixels).toBe(4); // the two added columns
  });

  it("notices a change in alpha", () => {
    expect(compareImages(solid(1, 1, [5, 5, 5, 255]), solid(1, 1, [5, 5, 5, 100])).changedPixels).toBe(1);
  });
});
