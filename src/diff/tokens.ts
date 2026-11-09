import { diffProps } from "./diff.js";
import type { Token, TokenChange } from "./types.js";

const key = (t: Token) => `${t.entity}\u0000${t.id}`;

/** A short description of a token, used for added and removed ones. */
export function tokenDetail(t: Token): string {
  switch (t.entity) {
    case "variable":
      return [t.props.collection, t.props.type].filter((x) => typeof x === "string" && x !== "").join(", ");
    case "style":
      return String(t.props.type ?? "");
    case "collection": {
      const modes = Array.isArray(t.props.modes) ? t.props.modes : [];
      return modes.length > 0 ? `modes: ${modes.join(", ")}` : "";
    }
  }
}

/**
 * Compare the variables, styles and collections of two documents. Tokens are matched by id; a
 * renamed token is reported as a change of `name`. Results follow the order of the old list,
 * then new tokens in the order of the new list.
 */
export function diffTokens(before: Token[], after: Token[]): TokenChange[] {
  const now = new Map(after.map((t) => [key(t), t]));
  const old = new Map(before.map((t) => [key(t), t]));
  const out: TokenChange[] = [];

  for (const t of before) {
    const n = now.get(key(t));
    if (!n) {
      out.push({ kind: "removed", entity: t.entity, id: t.id, name: t.name, detail: tokenDetail(t) });
      continue;
    }
    const props = diffProps({ name: t.name, ...t.props }, { name: n.name, ...n.props });
    if (props.length > 0) out.push({ kind: "modified", entity: n.entity, id: n.id, name: n.name, props });
  }
  for (const t of after) {
    if (!old.has(key(t))) out.push({ kind: "added", entity: t.entity, id: t.id, name: t.name, detail: tokenDetail(t) });
  }
  return out;
}
