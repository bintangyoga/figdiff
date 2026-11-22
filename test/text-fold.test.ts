import { describe, expect, it } from "vitest";
import { documentToTree } from "../src/parser/document.js";
import { diffTrees } from "../src/diff/diff.js";
import { formatText } from "../src/report.js";

type Raw = Record<string, unknown>;

function design(text: Raw) {
  const nodes: Record<string, Raw> = {
    "1": { id: 1, name: "App", type: "page", children: [2] },
    "2": { id: 2, name: "Home", type: "frame", parent: 1, children: [3], width: 300, height: 200 },
    "3": { id: 3, type: "text", parent: 2, ...text },
  };
  return documentToTree({ format: "figcraft", version: 1, name: "Test", pages: [1], nodes });
}

describe("text edits", () => {
  const before = design({ name: "Hello", characters: "Hello", width: 40 });

  it("folds a name that follows the words and marks the size as derived", () => {
    const changes = diffTrees(before, design({ name: "Hello world", characters: "Hello world", width: 80 }));
    expect(changes).toHaveLength(1);
    const props = changes[0]?.kind === "modified" ? changes[0].props : [];
    expect(props.map((p) => p.prop)).toEqual(["characters", "width"]);
    expect(props[1]?.derived).toBe(true);
    expect(formatText(changes)).toContain("width 40 → 80 (follows the text)");
  });

  it("keeps a rename that does not follow the words", () => {
    const changes = diffTrees(before, design({ name: "Title", characters: "Hello world", width: 40 }));
    const props = changes[0]?.kind === "modified" ? changes[0].props : [];
    expect(props.map((p) => p.prop)).toEqual(["characters", "name"]);
  });

  it("does not mark size as derived when the words did not change", () => {
    const changes = diffTrees(before, design({ name: "Hello", characters: "Hello", width: 80 }));
    const props = changes[0]?.kind === "modified" ? changes[0].props : [];
    expect(props[0]?.derived).toBeUndefined();
  });
});
