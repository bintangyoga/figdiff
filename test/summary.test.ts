import { describe, expect, it } from "vitest";
import { summarize } from "../src/diff/summary.js";
import type { Change } from "../src/diff/types.js";

const mod = (trail: string[], n: number): Change => ({
  kind: "modified",
  id: trail.join("/"),
  path: trail.join(" › "),
  trail,
  props: Array.from({ length: n }, (_, i) => ({ prop: `p${i}`, from: 1, to: 2 })),
});

describe("summarize", () => {
  it("counts property changes individually and frames once", () => {
    const changes: Change[] = [
      mod(["Screens", "Login", "A"], 2),
      mod(["Screens", "Login", "B"], 1),
      mod(["Screens", "Home", "C"], 1),
      { kind: "added", id: "9", path: "x", trail: ["Screens", "Home", "D"], type: "text" },
      { kind: "removed", id: "8", path: "y", trail: ["Screens", "Home", "E"], type: "text" },
    ];
    expect(summarize(changes)).toEqual({
      changes: 6,
      frames: 2,
      added: 1,
      removed: 1,
      moved: 0,
      reordered: 0,
      modifiedNodes: 3,
      propertyChanges: 4,
    });
  });

  it("does not count page-level changes as a frame", () => {
    expect(summarize([mod(["Screens"], 1)]).frames).toBe(0);
  });
});
