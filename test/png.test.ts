import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../src/render/png.js";
import { solid } from "./helpers.js";

describe("encodePng and decodePng", () => {
  it("round-trips pixels exactly", () => {
    const img = solid(3, 2, [10, 20, 30, 255]);
    img.data.set([255, 0, 0, 128], 4); // one translucent red pixel
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(3);
    expect(back.height).toBe(2);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  it("rejects pixel data that does not match the size", () => {
    expect(() => encodePng({ width: 2, height: 2, data: new Uint8Array(4) })).toThrow(/does not match/);
  });
});

describe("decodePng", () => {
  it("reads a real PNG written by FigCraft (scanline filters 1, 2 and 4)", () => {
    const img = decodePng(readFileSync(new URL("./fixtures/ridgeline-thumbnail.png", import.meta.url)));
    expect(img.width).toBe(400);
    expect(img.height).toBe(170);
    expect(img.data).toHaveLength(400 * 170 * 4);
    // A real thumbnail is not a flat color.
    const distinct = new Set<number>();
    for (let i = 0; i < img.data.length; i += 4) distinct.add((img.data[i] as number) << 16 | (img.data[i + 1] as number) << 8 | (img.data[i + 2] as number));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it("survives re-encoding a real PNG", () => {
    const img = decodePng(readFileSync(new URL("./fixtures/ridgeline-thumbnail.png", import.meta.url)));
    expect(Array.from(decodePng(encodePng(img)).data)).toEqual(Array.from(img.data));
  });

  it("rejects data that is not a PNG", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/Not a PNG/);
  });

  it("rejects a truncated file", () => {
    const png = encodePng(solid(20, 20, [1, 2, 3, 255]));
    expect(() => decodePng(png.subarray(0, 40))).toThrow();
  });
});
