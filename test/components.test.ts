import { describe, expect, it } from "vitest";
import { documentToTree } from "../src/parser/document.js";
import { diffTrees } from "../src/diff/diff.js";
import { formatText } from "../src/report.js";

type Raw = Record<string, unknown>;

function design(edit: (nodes: Record<string, Raw>) => void = () => {}) {
  const nodes: Record<string, Raw> = {
    "1": { id: 1, name: "App", type: "page", children: [2, 10] },
    "2": { id: 2, name: "Landscape", type: "componentSet", parent: 1, children: [3, 5] },
    "3": { id: 3, name: "Time=Day", type: "component", parent: 2, children: [4] },
    "4": { id: 4, name: "Sun", type: "ellipse", parent: 3, width: 10, height: 10 },
    "5": { id: 5, name: "Time=Dusk", type: "component", parent: 2, children: [] },
    "10": { id: 10, name: "Home", type: "frame", parent: 1, children: [11, 12] },
    "11": { id: 11, name: "Photo", type: "instance", parent: 10, component: 3, source: 3 },
    "12": { id: 12, name: "Photo 2", type: "instance", parent: 10, component: 3, source: 3 },
  };
  edit(nodes);
  return documentToTree({ format: "figcraft", version: 1, name: "Test", pages: [1], nodes });
}

describe("components and instances", () => {
  it("names a variant swap instead of showing component ids", () => {
    const changes = diffTrees(
      design(),
      design((n) => Object.assign(n["11"], { component: 5, source: 5 })),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "modified", props: [{ prop: "variant", from: "Time=Day", to: "Time=Dusk" }] });
  });

  it("names a swap to another component by set and variant", () => {
    const after = design((n) => {
      n["1"].children = [2, 10, 20];
      n["20"] = { id: 20, name: "Badge", type: "component", parent: 1, children: [] };
      Object.assign(n["11"], { component: 20, source: 20 });
    });
    const swap = diffTrees(design(), after).find((c) => c.kind === "modified");
    expect(swap).toMatchObject({ props: [{ prop: "component", from: "Landscape / Time=Day", to: "Badge" }] });
  });

  it("says how many instances a change inside a component reaches", () => {
    const changes = diffTrees(
      design(),
      design((n) => (n["4"].width = 12)),
    );
    expect(changes[0]?.instances).toBe(2);
    expect(formatText(changes)).toContain("(in a component used by 2 instances)");
  });

  it("leaves changes outside components alone", () => {
    const changes = diffTrees(
      design(),
      design((n) => (n["10"].name = "Start")),
    );
    expect(changes[0]?.instances).toBeUndefined();
  });
});
