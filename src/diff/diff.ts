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

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Properties that --tolerance applies to: size and position. Colors, opacity, radii and the like stay exact,
 * because their values are small (often 0 to 1) and a tolerance meant for pixels would hide real changes.
 */
const within = (a: unknown, b: unknown, tolerance: number): boolean =>
  typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= tolerance;

function sameWithTolerance(prop: string, a: unknown, b: unknown, tolerance: number): boolean {
  if (tolerance > 0) {
    if (prop === "width" || prop === "height") return within(a, b, tolerance) || sameValue(a, b);
    // transform is [a, b, c, d, x, y]: the first four are scale and rotation and stay exact; x and y get the tolerance
    if (prop === "transform" && Array.isArray(a) && Array.isArray(b) && a.length === 6 && b.length === 6) {
      return a.every((v, i) => (i < 4 ? sameValue(v, b[i]) : within(v, b[i], tolerance)));
    }
  }
  return sameValue(a, b);
}

export interface DiffOptions {
  /** Changes of at most this many units to width, height and position (x, y) are ignored. Default 0 (exact). */
  tolerance?: number;
}

export function diffProps(a: Record<string, unknown>, b: Record<string, unknown>, options: DiffOptions = {}): PropChange[] {
  const tolerance = options.tolerance ?? 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes: PropChange[] = [];
  for (const prop of [...keys].sort()) {
    if (!sameWithTolerance(prop, a[prop], b[prop], tolerance)) changes.push({ prop, from: a[prop], to: b[prop] });
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
export function diffTrees(before: DesignNode, after: DesignNode, options: DiffOptions = {}): Change[] {
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
      options,
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
