import type { Change, DesignNode, PropChange } from "./types.js";

const SEP = " › ";

interface Indexed {
  node: DesignNode;
  trail: string[];
  path: string;
  parentId: string | null;
}

function index(root: DesignNode): Map<string, Indexed> {
  const map = new Map<string, Indexed>();
  const walk = (node: DesignNode, trail: string[], parentId: string | null) => {
    map.set(node.id, { node, trail, path: [root.name, ...trail].join(SEP), parentId });
    for (const child of node.children) walk(child, [...trail, child.name], node.id);
  };
  walk(root, [], null);
  return map;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffProps(a: Record<string, unknown>, b: Record<string, unknown>): PropChange[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: PropChange[] = [];
  for (const prop of [...keys].sort()) {
    if (!sameValue(a[prop], b[prop])) changes.push({ prop, from: a[prop], to: b[prop] });
  }
  return changes;
}

/** True when children present in both versions appear in a different order. */
function childOrderChanged(old: DesignNode, now: DesignNode): boolean {
  const inNow = new Set(now.children.map((c) => c.id));
  const inOld = new Set(old.children.map((c) => c.id));
  const orderBefore = old.children.map((c) => c.id).filter((id) => inNow.has(id));
  const orderAfter = now.children.map((c) => c.id).filter((id) => inOld.has(id));
  return orderBefore.join(",") !== orderAfter.join(",");
}

/**
 * Compare two design trees and list what changed.
 *
 * Nodes are matched by id. Fallback matching by name and path is planned
 * for later, once id stability across saves is verified (see docs/format-notes.md).
 *
 * Changes come out in document order of the old tree, followed by added nodes
 * in document order of the new tree.
 */
export function diffTrees(before: DesignNode, after: DesignNode): Change[] {
  const a = index(before);
  const b = index(after);
  const changes: Change[] = [];

  for (const [id, old] of a) {
    const now = b.get(id);
    if (!now) {
      changes.push({ kind: "removed", id, path: old.path, trail: old.trail, type: old.node.type });
      continue;
    }
    const base = { id, path: now.path, trail: now.trail };
    if (old.parentId !== now.parentId) {
      changes.push({ ...base, kind: "moved", fromTrail: old.trail });
    }
    const props = diffProps(
      { name: old.node.name, type: old.node.type, ...old.node.props },
      { name: now.node.name, type: now.node.type, ...now.node.props },
    );
    if (props.length > 0) changes.push({ ...base, kind: "modified", props });
    if (childOrderChanged(old.node, now.node)) changes.push({ ...base, kind: "reordered" });
  }

  for (const [id, now] of b) {
    if (!a.has(id)) {
      changes.push({ kind: "added", id, path: now.path, trail: now.trail, type: now.node.type });
    }
  }

  return changes;
}
