import type { Token } from "../diff/types.js";
import { normalize } from "./document.js";

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Read variables, variable collections and styles from `document.json`.
 *
 * - `variables.collections[]` has `{id, name, modes: [{id, name}]}`
 * - `variables.variables[]` has `{id, name, collection, resolvedType, description, values: {modeId: {type, value}}}`
 * - `styles[]` has `{id, name, description, type, ...}` (`paints`, `effects`, and so on)
 *
 * A document without any of them gives an empty list. Values are keyed by mode *name*, so a
 * variable that only gets a new mode id is not reported. A value that refers to another variable by id
 * (a string, or an object such as `{type: "alias", id}`) is shown as "alias of <name>". The exact alias
 * encoding of FigCraft is not confirmed yet, so unknown shapes are left as they are.
 */
export function documentToTokens(doc: unknown): Token[] {
  if (!isObject(doc)) return [];
  const tokens: Token[] = [];

  const vars = isObject(doc.variables) ? doc.variables : {};
  const collections = Array.isArray(vars.collections) ? vars.collections.filter(isObject) : [];
  const modeNames = new Map<string, string>();
  const collectionNames = new Map<string, string>();

  for (const c of collections) {
    const modes = Array.isArray(c.modes) ? c.modes.filter(isObject) : [];
    for (const m of modes) modeNames.set(String(m.id), String(m.name ?? m.id));
    collectionNames.set(String(c.id), String(c.name ?? c.id));
    tokens.push({
      id: String(c.id),
      entity: "collection",
      name: String(c.name ?? ""),
      props: { modes: modes.map((m) => String(m.name ?? m.id)) },
    });
  }

  for (const v of Array.isArray(vars.variables) ? vars.variables.filter(isObject) : []) {
    const props: Raw = {
      collection: collectionNames.get(String(v.collection)) ?? v.collection,
      type: v.resolvedType,
      description: v.description ?? "",
    };
    if (isObject(v.values)) {
      for (const [modeId, entry] of Object.entries(v.values)) {
        const value = isObject(entry) && "value" in entry ? entry.value : entry;
        props[`value ${modeNames.get(modeId) ?? modeId}`] = normalize(value);
      }
    }
    tokens.push({ id: String(v.id), entity: "variable", name: String(v.name ?? ""), props });
  }

  // A value that points at another variable is shown as that variable's name instead of an id.
  const names = new Map(tokens.filter((t) => t.entity === "variable").map((t) => [t.id, t.name]));
  const resolve = (value: unknown): unknown => {
    if (typeof value === "string" && names.has(value)) return `alias of ${names.get(value)}`;
    if (isObject(value)) {
      const target = [value.id, value.variableId, value.value].find((x) => typeof x === "string" && names.has(x));
      const isAlias = /alias/i.test(String(value.type ?? "")) || Object.keys(value).every((k) => k === "id" || k === "variableId");
      if (target !== undefined && isAlias) return `alias of ${names.get(target as string)}`;
    }
    return value;
  };
  for (const t of tokens) {
    if (t.entity !== "variable") continue;
    for (const k of Object.keys(t.props)) if (k.startsWith("value ")) t.props[k] = resolve(t.props[k]);
  }

  for (const st of Array.isArray(doc.styles) ? doc.styles.filter(isObject) : []) {
    const props: Raw = {};
    for (const [k, val] of Object.entries(st)) if (k !== "id" && k !== "name") props[k] = normalize(val);
    tokens.push({ id: String(st.id), entity: "style", name: String(st.name ?? ""), props });
  }

  return tokens;
}
