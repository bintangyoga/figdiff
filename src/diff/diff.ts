import type { Change, DesignNode, PropChange } from "./types.js";

interface Indexed {
  node: DesignNode;
  path: string;
  parentId: string | null;
}

function index(root: DesignNode): Map<string, Indexed> {
  const map = new Map<string, Indexed>();
  const walk = (node: DesignNode, parentPath: string, parentId: string | null) => {
    const path = parentPath ? `${parentPath} › ${node.name}` : node.name;
    map.set(node.id, { node, path, parentId });
    for (const child of node.children) walk(child, path, node.id);
  };
  walk(root, "", null);
  return map;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffProps(a: Record<string, unknown>, b: Record<string, unknown>): PropChange[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: PropChange[] = [];
  for (const prop of [...keys].sort()) {
    if (!sameValue(a[prop], b[prop])) changes.push({ prop, from: a[prop], to: b[prop] });
  }
  return changes;
}

/**
 * Compare two design trees and list what changed.
 *
 * Nodes are matched by id. Fallback matching by name and path is planned
 * for Phase 1, once node id stability is verified (see README, Phase 0).
 */
export function diffTrees(before: DesignNode, after: DesignNode): Change[] {
  const a = index(before);
  const b = index(after);
  const changes: Change[] = [];

  for (const [id, old] of a) {
    const now = b.get(id);
    if (!now) {
      changes.push({ kind: "removed", id, path: old.path, type: old.node.type });
      continue;
    }
    if (old.parentId !== now.parentId) {
      changes.push({ kind: "moved", id, path: now.path, from: old.path, to: now.path });
    }
    const props = diffProps(
      { name: old.node.name, type: old.node.type, ...old.node.props },
      { name: now.node.name, type: now.node.type, ...now.node.props },
    );
    if (props.length > 0) changes.push({ kind: "modified", id, path: now.path, props });
  }

  for (const [id, now] of b) {
    if (!a.has(id)) changes.push({ kind: "added", id, path: now.path, type: now.node.type });
  }

  return changes;
}
