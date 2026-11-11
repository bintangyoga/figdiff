import type { Image } from "../src/render/png.js";

/** An image filled with a single RGBA color. */
export function solid(width: number, height: number, rgba: [number, number, number, number]): Image {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}

import { strToU8, zipSync } from "fflate";

/** A minimal but valid .figcraft archive: one page, one frame, a button (and optionally a hint). */
export function makeFigcraft(red: number, extraNode = false): Uint8Array {
  const nodes: Record<string, Record<string, unknown>> = {
    "1": { id: 1, name: "Screens", type: "page", children: [2] },
    "2": { id: 2, name: "Login", type: "frame", parent: 1, children: extraNode ? [3, 4] : [3], width: 100, height: 100 },
    "3": {
      id: 3,
      name: "Button",
      type: "rectangle",
      parent: 2,
      width: 10,
      height: 10,
      fills: [{ type: "solid", color: { r: red, g: 0, b: 0, a: 1 } }],
    },
  };
  if (extraNode) nodes["4"] = { id: 4, name: "Hint", type: "text", parent: 2, characters: "Hi" };
  const doc = { format: "figcraft", version: 1, name: "App", pages: [1], nodes };
  return zipSync({ "document.json": strToU8(JSON.stringify(doc)) });
}
