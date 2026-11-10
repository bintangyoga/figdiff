import { describe, expect, it } from "vitest";
import { diffTrees } from "../src/diff/diff.js";
import { documentToTree } from "../src/parser/document.js";

type Raw = Record<string, unknown>;

/** Build a minimal document in FigCraft's flat format. */
function doc(nodes: Raw[], pages = [1]): unknown {
  return {
    format: "figcraft",
    version: 1,
    name: "Test",
    pages,
    nodes: Object.fromEntries(nodes.map((n) => [String(n.id), n])),
  };
}

const page = (children: number[]): Raw => ({ id: 1, name: "Screens", type: "page", children });
const frame = (id: number, parent: number, name: string, children: number[] = []): Raw => ({
  id, name, type: "frame", parent, children, width: 100, height: 100,
});
const rect = (id: number, parent: number, name: string, color: number): Raw => ({
  id, name, type: "rectangle", parent, width: 10, height: 10,
  fills: [{ type: "solid", color: { r: color, g: 0, b: 0, a: 1 } }],
});

const before = documentToTree(
  doc([page([2]), frame(2, 1, "Login", [3, 4]), rect(3, 2, "Button", 0.2), rect(4, 2, "Promo", 0.5)]),
);

describe("diffTrees", () => {
  it("reports no changes for identical trees", () => {
    expect(diffTrees(before, before)).toEqual([]);
  });

  it("detects a modified property", () => {
    const after = documentToTree(
      doc([page([2]), frame(2, 1, "Login", [3, 4]), rect(3, 2, "Button", 0.9), rect(4, 2, "Promo", 0.5)]),
    );
    const changes = diffTrees(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "modified", id: "3", path: "Test › Screens › Login › Button" });
  });

  it("detects added and removed nodes", () => {
    const after = documentToTree(
      doc([page([2]), frame(2, 1, "Login", [3, 5]), rect(3, 2, "Button", 0.2), rect(5, 2, "Forgot", 0.1)]),
    );
    expect(diffTrees(before, after).map((c) => c.kind).sort()).toEqual(["added", "removed"]);
  });

  it("detects a node moved to another parent", () => {
    const after = documentToTree(
      doc([
        page([2, 6]),
        frame(2, 1, "Login", [3]),
        frame(6, 1, "Home", [4]),
        rect(3, 2, "Button", 0.2),
        rect(4, 6, "Promo", 0.5),
      ]),
    );
    const kinds = diffTrees(before, after).map((c) => c.kind);
    expect(kinds).toContain("moved");
    expect(kinds).toContain("added");
  });

  it("reports a rename as a modified name", () => {
    const after = documentToTree(
      doc([page([2]), frame(2, 1, "Sign in", [3, 4]), rect(3, 2, "Button", 0.2), rect(4, 2, "Promo", 0.5)]),
    );
    const changes = diffTrees(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "modified", id: "2", props: [{ prop: "name", from: "Login", to: "Sign in" }] });
  });

  it("records the trail from the page down, without the document name", () => {
    const after = documentToTree(
      doc([page([2]), frame(2, 1, "Login", [3, 4]), rect(3, 2, "Button", 0.9), rect(4, 2, "Promo", 0.5)]),
    );
    expect(diffTrees(before, after)[0]?.trail).toEqual(["Screens", "Login", "Button"]);
  });

  it("detects a change in layer order", () => {
    const after = documentToTree(
      doc([page([2]), frame(2, 1, "Login", [4, 3]), rect(3, 2, "Button", 0.2), rect(4, 2, "Promo", 0.5)]),
    );
    const changes = diffTrees(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "reordered", id: "2" });
  });

  it("does not report a reorder just because a child was removed", () => {
    const after = documentToTree(doc([page([2]), frame(2, 1, "Login", [4]), rect(4, 2, "Promo", 0.5)]));
    expect(diffTrees(before, after).map((c) => c.kind)).toEqual(["removed"]);
  });
});

describe("tolerance", () => {
  const node = (extra: Raw): unknown => doc([page([2]), { ...rect(2, 1, "Box", 1), ...extra }]);
  const diff = (a: Raw, b: Raw, tolerance?: number) => diffTrees(documentToTree(node(a)), documentToTree(node(b)), tolerance === undefined ? {} : { tolerance });

  it("is exact by default", () => {
    expect(diff({ width: 80 }, { width: 80.3 })).toHaveLength(1);
  });

  it("ignores small changes to width, height and position", () => {
    const t = [1, 0, 0, 1, 10.2, 5];
    expect(diff({ width: 80, height: 14.3, transform: t }, { width: 80.3, height: 14, transform: [1, 0, 0, 1, 10.5, 5.4] }, 0.5)).toEqual([]);
  });

  it("still reports larger size changes", () => {
    expect(diff({ width: 80 }, { width: 82 }, 0.5)).toHaveLength(1);
    expect(diff({ transform: [1, 0, 0, 1, 0, 0] }, { transform: [1, 0, 0, 1, 3, 0] }, 0.5)).toHaveLength(1);
  });

  it("never hides a change in scale or rotation", () => {
    expect(diff({ transform: [1, 0, 0, 1, 0, 0] }, { transform: [0.9, 0, 0, 1, 0, 0] }, 1)).toHaveLength(1);
  });

  it("never hides color, opacity or radius changes, however large the tolerance", () => {
    // these values are small (0 to 1), so a tolerance meant for pixels must not apply to them
    const fill = (r: number, opacity = 1) => ({ fills: [{ type: "solid", opacity, color: { r, g: 0, b: 0, a: 1 } }] });
    expect(diff(fill(0.05), fill(0.93), 1)).toHaveLength(1);
    expect(diff(fill(0.5, 0.3), fill(0.5, 0.7), 1)).toHaveLength(1);
    expect(diff({ corners: { radii: [0, 0, 0, 0] } }, { corners: { radii: [8, 8, 8, 8] } }, 100)).toHaveLength(1);
  });
});
