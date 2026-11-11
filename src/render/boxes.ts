import type { Change, DesignNode } from "../diff/types.js";
import type { Renderer } from "./figcraft-cli.js";

/** Where a node sits in its top-level frame, as fractions (0 to 1) of the frame's width and height. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placed {
  node: DesignNode;
  parent?: Placed;
}

function index(root: DesignNode): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const walk = (n: DesignNode, parent?: Placed) => {
    const p: Placed = { node: n, parent };
    out.set(n.id, p);
    n.children.forEach((c) => walk(c, p));
  };
  walk(root);
  return out;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Translation of a node, or undefined when it is rotated, scaled or skewed. */
function offset(n: DesignNode): [number, number] | undefined {
  const t = n.props.transform;
  if (t === undefined) return [0, 0];
  if (!Array.isArray(t) || t.length !== 6 || !t.every((v) => typeof v === "number")) return undefined;
  const [a, b, c, d, x, y] = t as number[];
  if (a !== 1 || b !== 0 || c !== 0 || d !== 1) return undefined;
  return [x as number, y as number];
}

/** True when the parent's auto layout decides where the child goes, so the file does not say. */
function placedByLayout(parent: DesignNode, child: DesignNode): boolean {
  const layout = parent.props.layout as { mode?: unknown } | undefined;
  const mode = layout?.mode;
  if (mode === undefined || mode === "none") return false;
  const childLayout = child.props.child_layout as { absolute?: unknown } | undefined;
  return childLayout?.absolute !== true;
}

function boxOf(placed: Placed): Box | undefined {
  const chain: Placed[] = [];
  for (let p: Placed | undefined = placed; p; p = p.parent) chain.unshift(p);
  // chain: document, page, frame, ..., node
  const frame = chain[2];
  if (!frame || chain.length < 4) return undefined;
  const fw = num(frame.node.props.width);
  const fh = num(frame.node.props.height);
  const w = num(placed.node.props.width);
  const h = num(placed.node.props.height);
  if (!fw || !fh || w === undefined || h === undefined) return undefined;
  let x = 0;
  let y = 0;
  for (let i = 3; i < chain.length; i++) {
    const node = (chain[i] as Placed).node;
    if (placedByLayout((chain[i - 1] as Placed).node, node)) return undefined;
    const o = offset(node);
    if (!o) return undefined;
    x += o[0];
    y += o[1];
  }
  const box = { x: x / fw, y: y / fh, w: w / fw, h: h / fh };
  if (box.x >= 1 || box.y >= 1 || box.x + box.w <= 0 || box.y + box.h <= 0) return undefined;
  return box;
}

/**
 * Boxes for the changes whose position can be read from the file: nodes that are not rotated and not placed by
 * auto layout. Removed nodes are placed in the old version, everything else in the new one. Keyed by node id.
 */
export function changeBoxes(before: DesignNode, after: DesignNode, changes: Change[]): Record<string, Box> {
  const a = index(before);
  const b = index(after);
  const out: Record<string, Box> = {};
  for (const c of changes) {
    const placed = (c.kind === "removed" ? a : b).get(c.id);
    if (!placed || out[c.id]) continue;
    const box = boxOf(placed);
    if (box) out[c.id] = box;
  }
  return out;
}

const frameOf = (p: Placed): Placed | undefined => {
  const chain: Placed[] = [];
  for (let q: Placed | undefined = p; q; q = q.parent) chain.unshift(q);
  return chain.length >= 4 ? chain[2] : undefined;
};

/**
 * Like `changeBoxes`, but asks figcraft-cli where each node ended up, so nodes placed by auto layout are found
 * too. Falls back to positions read from the file for anything the CLI did not answer.
 */
export function locateChanges(
  before: DesignNode,
  after: DesignNode,
  changes: Change[],
  files: { before: string; after: string },
  renderer: Renderer,
): Record<string, Box> {
  const out = changeBoxes(before, after, changes);
  if (!renderer.bounds) return out;
  const sides = [
    { tree: index(before), file: files.before, wanted: changes.filter((c) => c.kind === "removed") },
    { tree: index(after), file: files.after, wanted: changes.filter((c) => c.kind !== "removed") },
  ];
  for (const side of sides) {
    const pairs = new Map<string, string>(); // node id -> frame id
    for (const c of side.wanted) {
      const placed = side.tree.get(c.id);
      const frame = placed && frameOf(placed);
      if (placed && frame && frame !== placed) pairs.set(c.id, frame.node.id);
    }
    if (pairs.size === 0) continue;
    const ids = [...new Set([...pairs.keys(), ...pairs.values()])];
    const bounds = renderer.bounds(side.file, ids);
    for (const [id, frameId] of pairs) {
      const b = bounds.get(id);
      const f = bounds.get(frameId);
      if (!b || !f || f.width <= 0 || f.height <= 0) continue;
      const box = { x: (b.x - f.x) / f.width, y: (b.y - f.y) / f.height, w: b.width / f.width, h: b.height / f.height };
      if (box.x >= 1 || box.y >= 1 || box.x + box.w <= 0 || box.y + box.h <= 0) continue;
      out[id] = box;
    }
  }
  return out;
}
