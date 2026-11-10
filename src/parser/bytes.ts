import { unzipSync, strFromU8 } from "fflate";
import type { DesignNode, Token } from "../diff/types.js";
import { documentToTree } from "./document.js";
import { documentToTokens } from "./tokens.js";

/**
 * Read a .figcraft archive from its bytes and return the parsed `document.json`.
 * Free of Node APIs, so it also runs in a browser. `label` names the file in error messages.
 */
export function readDocumentJsonFromBytes(bytes: Uint8Array, label = "file"): unknown {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === "document.json" });
  } catch {
    throw new Error(`${label}: not a zip archive. Is this a .figcraft file?`);
  }
  const entry = files["document.json"];
  if (!entry) throw new Error(`${label}: no document.json found. Is this a .figcraft file?`);
  try {
    return JSON.parse(strFromU8(entry));
  } catch {
    throw new Error(`${label}: document.json is not valid JSON`);
  }
}

/** The design tree and its variables and styles, from the bytes of a .figcraft file. */
export function parseFigcraftBytes(bytes: Uint8Array, label = "file"): { tree: DesignNode; tokens: Token[] } {
  const doc = readDocumentJsonFromBytes(bytes, label);
  return { tree: documentToTree(doc), tokens: documentToTokens(doc) };
}
