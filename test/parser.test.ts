import { describe, expect, it } from "vitest";
import { documentToTree } from "../src/parser/document.js";

const base = {
  format: "figcraft",
  version: 1,
  name: "App",
  pages: [1],
  nodes: {
    "1": { id: 1, name: "Screens", type: "page", children: [2] },
    "2": { id: 2, name: "Box", type: "rectangle", parent: 1, transform: [1, 0, 0, 1, 8.000000000000002, 16], width: 10 },
  },
};

describe("documentToTree", () => {
  it("builds a tree from the flat node map", () => {
    const tree = documentToTree(base);
    expect(tree.name).toBe("App");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.name).toBe("Screens");
    expect(tree.children[0]?.children[0]).toMatchObject({ id: "2", type: "rectangle", name: "Box" });
  });

  it("keeps structural keys out of props", () => {
    const box = documentToTree(base).children[0]?.children[0];
    expect(Object.keys(box?.props ?? {}).sort()).toEqual(["transform", "width"]);
  });

  it("rounds floating point noise", () => {
    const box = documentToTree(base).children[0]?.children[0];
    expect(box?.props.transform).toEqual([1, 0, 0, 1, 8, 16]);
  });

  it("rejects documents that are not FigCraft files", () => {
    expect(() => documentToTree({ format: "other" })).toThrow(/Not a FigCraft document/);
    expect(() => documentToTree(null)).toThrow();
  });

  it("reports a missing node reference", () => {
    const broken = { ...base, nodes: { "1": base.nodes["1"] } };
    expect(() => documentToTree(broken)).toThrow(/missing/);
  });

  it("rejects a node that appears twice in the tree", () => {
    const twice = { ...base, pages: [1, 1] };
    expect(() => documentToTree(twice)).toThrow(/more than once/);
  });
});
