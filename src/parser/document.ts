import type { DesignNode } from "../diff/types.js";
import { dropDefaults } from "./defaults.js";

type Raw = Record<string, unknown>;

/** Keys that describe structure rather than appearance; they are not diffed as props. */
const STRUCTURAL_KEYS = new Set(["id", "name", "type", "children", "parent"]);

/** Number of decimals kept when comparing numbers (absorbs float noise like 8.000000000000002). */
const PRECISION = 10_000;

export function normalize(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * PRECISION) / PRECISION;
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    const out: Raw = {};
    for (const [k, v] of Object.entries(value as Raw)) out[k] = normalize(v);
    return out;
  }
  return value;
}

/**
 * Convert the contents of a `.figcraft` file's `document.json` into figdiff's tree.
 *
 * Format (observed in FigCraft's example files, document version 1):
 * - `nodes` is a flat map from node id (a string key) to the node
 * - each node lists child ids in `children`; the root of the tree is each page in `pages`
 * - numeric ids; `next_id` is the id counter
 *
 * See docs/format-notes.md.
 */
export function documentToTree(doc: unknown): DesignNode {
  if (doc === null || typeof doc !== "object") throw new Error("document.json is not an object");
  const d = doc as Raw;
  if (d.format !== "figcraft") {
    throw new Error(`Not a FigCraft document (format: ${JSON.stringify(d.format)})`);
  }
  const nodes = d.nodes as Record<string, Raw> | undefined;
  const pages = d.pages as unknown[] | undefined;
  if (!nodes || typeof nodes !== "object" || !Array.isArray(pages)) {
    throw new Error("document.json has no `nodes` map or `pages` list");
  }

  const seen = new Set<string>();
  const build = (id: unknown): DesignNode => {
    const key = String(id);
    const raw = nodes[key];
    if (!raw) throw new Error(`Node ${key} is referenced but missing from document.json`);
    if (seen.has(key)) throw new Error(`Node ${key} appears more than once in the tree`);
    seen.add(key);

    const all: Raw = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!STRUCTURAL_KEYS.has(k)) all[k] = normalize(v);
    }
    const props = dropDefaults(all);
    const children = Array.isArray(raw.children) ? raw.children.map(build) : [];
    return {
      id: key,
      type: String(raw.type ?? "unknown"),
      name: String(raw.name ?? ""),
      props,
      children,
    };
  };

  return {
    id: "document",
    type: "document",
    name: String(d.name ?? "Untitled"),
    props: {},
    children: pages.map(build),
  };
}
