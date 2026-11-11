import { describe, expect, it } from "vitest";
import { diffTrees } from "../src/diff/diff.js";
import { documentToTree } from "../src/parser/document.js";
import { formatText } from "../src/report.js";
import { formatHtml } from "../src/html.js";

/** A synthetic document with `frames` frames of `perFrame` rectangles each. */
function bigDocument(frames: number, perFrame: number, tweak: (id: number) => boolean) {
  const nodes: Record<string, unknown> = {};
  let next = 2;
  const frameIds: number[] = [];
  for (let f = 0; f < frames; f++) {
    const frameId = next++;
    const kids: number[] = [];
    for (let k = 0; k < perFrame; k++) {
      const id = next++;
      kids.push(id);
      nodes[String(id)] = {
        id,
        name: `Rect ${f}-${k}`,
        type: "rectangle",
        parent: frameId,
        width: 100 + (tweak(id) ? 5 : 0),
        height: 40,
        transform: [1, 0, 0, 1, k * 3, f * 50],
        fills: [{ type: "solid", color: { r: 0.1, g: 0.2, b: tweak(id) ? 0.9 : 0.3, a: 1 }, opacity: 1 }],
        children: [],
      };
    }
    nodes[String(frameId)] = { id: frameId, name: `Frame ${f}`, type: "frame", parent: 1, width: 400, height: 800, children: kids };
    frameIds.push(frameId);
  }
  nodes["1"] = { id: 1, name: "Page", type: "page", children: frameIds, width: 0, height: 0 };
  return { format: "figcraft", version: 1, name: "Big", pages: [1], nodes, next_id: next };
}

describe("large files", () => {
  it("compares 10,000 nodes with 1,000 edits in a few seconds", () => {
    const before = bigDocument(100, 100, () => false);
    const after = bigDocument(100, 100, (id) => id % 10 === 0);

    const t0 = performance.now();
    const a = documentToTree(before as never);
    const b = documentToTree(after as never);
    const t1 = performance.now();
    const changes = diffTrees(a, b);
    const t2 = performance.now();
    const text = formatText(changes);
    const html = formatHtml(changes, {});
    const t3 = performance.now();

    console.log(`10,000 nodes: parse ${Math.round(t1 - t0)} ms, diff ${Math.round(t2 - t1)} ms, report ${Math.round(t3 - t2)} ms`);
    expect(changes.length).toBe(1000);
    expect(text.length).toBeGreaterThan(0);
    expect(html.length).toBeGreaterThan(0);
    expect(t3 - t0).toBeLessThan(5000);
  });

  it("handles a very deep tree without overflowing the stack", () => {
    const depth = 500;
    const nodes: Record<string, unknown> = { "1": { id: 1, name: "P", type: "page", children: [2], width: 0, height: 0 } };
    for (let i = 2; i < depth + 2; i++) {
      nodes[String(i)] = {
        id: i,
        name: `n${i}`,
        type: "frame",
        parent: i - 1,
        width: 10,
        height: 10,
        children: i < depth + 1 ? [i + 1] : [],
      };
    }
    const doc = { format: "figcraft", version: 1, name: "Deep", pages: [1], nodes, next_id: depth + 2 };
    const tree = documentToTree(doc as never);
    expect(diffTrees(tree, tree)).toEqual([]);
  });
});
