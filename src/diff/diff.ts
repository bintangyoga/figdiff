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
  /**
   * When ids differ between the two versions (some tools give nodes new ids on save), pair nodes that have no
   * id match on either side by type and path of names. Pairs are made only when both versions have the same
   * number of such nodes at that path. Default true. Set to false to match by id alone.
   */
  matchByName?: boolean;
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

/** Returns a copy of `after` where nodes that have no id match are given the id of their counterpart in `before`. */
function reconcileIds(before: DesignNode, after: DesignNode): DesignNode {
  const a = index(before);
  const b = index(after);
  const key = (e: Indexed) => `${e.node.type}\u0000${e.path}`;
  const group = (m: Map<string, Indexed>, other: Map<string, Indexed>) => {
    const g = new Map<string, string[]>();
    for (const [id, e] of m) {
      if (other.has(id)) continue;
      const k = key(e);
      g.set(k, [...(g.get(k) ?? []), id]);
    }
    return g;
  };
  const lostA = group(a, b);
  const lostB = group(b, a);
  const remap = new Map<string, string>();
  for (const [k, idsB] of lostB) {
    const idsA = lostA.get(k);
    if (idsA && idsA.length === idsB.length) idsB.forEach((id, i) => remap.set(id, idsA[i] as string));
  }
  if (remap.size === 0) return after;
  const ref = (v: unknown) => {
    const mapped = v === undefined ? undefined : remap.get(String(v));
    if (mapped === undefined) return v;
    return typeof v === "number" ? Number(mapped) : mapped;
  };
  const copy = (n: DesignNode): DesignNode => {
    const props = n.type === "instance" ? { ...n.props, component: ref(n.props.component), source: ref(n.props.source) } : n.props;
    for (const k of ["component", "source"]) if (props[k] === undefined) delete props[k];
    return { ...n, id: remap.get(n.id) ?? n.id, props, children: n.children.map(copy) };
  };
  return copy(after);
}

interface ComponentInfo {
  /** Readable name of each component and component set, by id: "Set / Variant" for a variant. */
  names: Map<string, string>;
  /** Id of the set a variant belongs to. */
  setOf: Map<string, string>;
  /** The variant's own name, without the set. */
  variant: Map<string, string>;
  /** Number of instances per component id. */
  uses: Map<string, number>;
  /** For every node inside a component (and the component itself), the id of that component. */
  owner: Map<string, string>;
}

function componentInfo(root: DesignNode): ComponentInfo {
  const info: ComponentInfo = { names: new Map(), setOf: new Map(), variant: new Map(), uses: new Map(), owner: new Map() };
  const walk = (n: DesignNode, parent: DesignNode | null, owner: string | undefined) => {
    let own = owner;
    if (n.type === "componentSet") info.names.set(n.id, n.name);
    if (n.type === "component") {
      own = n.id;
      if (parent?.type === "componentSet") {
        info.names.set(n.id, `${parent.name} / ${n.name}`);
        info.setOf.set(n.id, parent.id);
        info.variant.set(n.id, n.name);
      } else info.names.set(n.id, n.name);
    }
    if (n.type === "instance" && n.props.component !== undefined) {
      const c = String(n.props.component);
      info.uses.set(c, (info.uses.get(c) ?? 0) + 1);
    }
    if (own !== undefined) info.owner.set(n.id, own);
    for (const c of n.children) walk(c, n, own);
  };
  walk(root, null, undefined);
  return info;
}

/** Shows component references on instances by name, and labels a swap within one component set as a variant change. */
function describeComponents(changes: Change[], before: ComponentInfo, after: ComponentInfo): Change[] {
  return changes.map((c) => {
    const info = c.kind === "removed" ? before : after;
    const owner = info.owner.get(c.id);
    const instances = owner !== undefined ? (info.uses.get(owner) ?? 0) : 0;
    let out: Change = instances > 0 ? { ...c, instances } : c;
    if (out.kind !== "modified") return out;
    const ref = out.props.find((p) => p.prop === "component");
    const props = out.props
      .filter(
        (p) =>
          !(
            p.prop === "source" &&
            ref &&
            JSON.stringify(p.from) === JSON.stringify(ref.from) &&
            JSON.stringify(p.to) === JSON.stringify(ref.to)
          ),
      )
      .map((p) => {
        if (p.prop !== "component" && p.prop !== "source") return p;
        const from = p.from === undefined ? undefined : String(p.from);
        const to = p.to === undefined ? undefined : String(p.to);
        const fromName = from !== undefined ? (before.names.get(from) ?? after.names.get(from)) : undefined;
        const toName = to !== undefined ? (after.names.get(to) ?? before.names.get(to)) : undefined;
        const fromSet = from !== undefined ? (before.setOf.get(from) ?? after.setOf.get(from)) : undefined;
        const toSet = to !== undefined ? (after.setOf.get(to) ?? before.setOf.get(to)) : undefined;
        if (p.prop === "component" && fromSet !== undefined && fromSet === toSet) {
          const variant = (id: string) => before.variant.get(id) ?? after.variant.get(id) ?? id;
          return { prop: "variant", from: variant(from as string), to: variant(to as string) };
        }
        return { prop: p.prop, from: fromName ?? p.from, to: toName ?? p.to };
      });
    out = { ...out, props };
    return out;
  });
}

/**
 * Compare two design trees and list what changed.
 *
 * Nodes are matched by id. Nodes that have no id match on either side are then paired by type and path
 * (unless `matchByName` is false), so a file whose ids changed on save still gives a readable diff.
 *
 * Changes come out in document order of the old tree, followed by added nodes
 * in document order of the new tree.
 */
export function diffTrees(before: DesignNode, after: DesignNode, options: DiffOptions = {}): Change[] {
  if (options.matchByName !== false) after = reconcileIds(before, after);
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

  return describeComponents(changes, componentInfo(before), componentInfo(after));
}
