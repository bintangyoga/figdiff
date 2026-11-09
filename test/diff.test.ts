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
});
