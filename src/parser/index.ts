import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import type { DesignNode } from "../diff/types.js";

/**
 * Read a .figcraft archive and return its parsed `document.json`.
 *
 * The archive is a zip containing `document.json`, `images/`, and optional
 * `thumbnail.png`, `versions/`, `branches/` and `library/`.
 */
export function readDocumentJson(path: string): unknown {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const entry = files["document.json"];
  if (!entry) throw new Error(`${path}: no document.json found. Is this a .figcraft file?`);
  return JSON.parse(strFromU8(entry));
}

/**
 * Convert FigCraft's document JSON into figdiff's internal tree.
 *
 * TODO (Phase 0): the real schema of `document.json` is not documented here
 * yet. Until docs/format-notes.md exists, this expects an already-normalised
 * tree of the form { id, type, name, children, ...props } and is used by tests.
 */
export function toDesignTree(doc: unknown): DesignNode {
  const raw = doc as Record<string, unknown>;
  const { id, type, name, children, ...props } = raw;
  const kids = Array.isArray(children) ? children.map(toDesignTree) : [];
  return {
    id: String(id ?? ""),
    type: String(type ?? "UNKNOWN"),
    name: String(name ?? ""),
    props,
    children: kids,
  };
}

export function parseFigcraft(path: string): DesignNode {
  return toDesignTree(readDocumentJson(path));
}
