import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { DesignNode, Token } from "../diff/types.js";
import { documentToTree } from "./document.js";
import { documentToTokens } from "./tokens.js";

export { documentToTree } from "./document.js";
export { documentToTokens } from "./tokens.js";

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

/** The design tree and its variables and styles, from one read of the file. */
export function parseFigcraftFull(path: string): { tree: DesignNode; tokens: Token[] } {
  const doc = readDocumentJson(path);
  return { tree: documentToTree(doc), tokens: documentToTokens(doc) };
}
