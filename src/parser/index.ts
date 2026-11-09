import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { DesignNode } from "../diff/types.js";
import { documentToTree } from "./document.js";

export { documentToTree } from "./document.js";

/**
 * Read a .figcraft archive and return its parsed `document.json`.
 *
 * The archive is a zip containing `document.json`, and optionally
 * `thumbnail.png`, `images/`, `versions/`, `branches/` and `library/`.
 */
export function readDocumentJson(path: string): unknown {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const entry = files["document.json"];
  if (!entry) throw new Error(`${path}: no document.json found. Is this a .figcraft file?`);
  return JSON.parse(strFromU8(entry));
}

export function parseFigcraft(path: string): DesignNode {
  return documentToTree(readDocumentJson(path));
}
