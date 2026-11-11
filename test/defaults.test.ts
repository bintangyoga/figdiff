import { describe, expect, it } from "vitest";
import { diffTrees } from "../src/diff/diff.js";
import { dropDefaults } from "../src/parser/defaults.js";
import { documentToTree } from "../src/parser/document.js";

const layout = { mode: "vertical", gap: 8 };

function doc(saved: "old" | "new", gap = 8) {
  return {
    format: "figcraft",
    version: 1,
    name: "D",
    pages: [1],
    nodes: {
      "1": { id: 1, name: "P", type: "page", children: [2], ...(saved === "old" ? { guides: [] } : {}) },
      "2": {
        id: 2,
        name: "F",
        type: "frame",
        parent: 1,
        children: [],
        layout: saved === "new" ? { ...layout, gap, content_align: "auto" } : { ...layout, gap },
      },
    },
  };
}

describe("defaults FigCraft adds on save", () => {
  it("drops an empty guides array and layout.content_align 'auto'", () => {
    expect(dropDefaults({ guides: [], layout: { mode: "vertical", content_align: "auto" }, x: 1 })).toEqual({
      layout: { mode: "vertical" },
      x: 1,
    });
  });

  it("keeps real values", () => {
    const props = { guides: [{ axis: "x", pos: 10 }], layout: { mode: "vertical", content_align: "center" } };
    expect(dropDefaults(props)).toEqual(props);
  });

  it("does not mistake an old file and a re-saved copy of it for a change", () => {
    expect(diffTrees(documentToTree(doc("old")), documentToTree(doc("new")))).toEqual([]);
  });

  it("still reports a real layout change", () => {
    const changes = diffTrees(documentToTree(doc("old", 8)), documentToTree(doc("new", 12)));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "modified", id: "2" });
  });
});
