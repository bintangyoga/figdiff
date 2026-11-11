import { describe, expect, it } from "vitest";
import { formatSummary, formatText, formatValue } from "../src/report.js";
import type { Change } from "../src/diff/types.js";

describe("formatValue", () => {
  it("renders solid fills as hex", () => {
    const fills = [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }];
    expect(formatValue(fills)).toBe("#FF0000");
  });

  it("adds alpha to translucent colors", () => {
    expect(formatValue({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });

  it("summarizes gradients", () => {
    const fills = [{ type: "gradient", kind: "linear", stops: [{}, {}] }];
    expect(formatValue(fills)).toBe("linear gradient, 2 stops");
  });

  it("falls back to JSON and handles empty values", () => {
    expect(formatValue(undefined)).toBe("(none)");
    expect(formatValue([])).toBe("(none)");
    expect(formatValue(12)).toBe("12");
  });
});

describe("formatText", () => {
  const changes: Change[] = [
    {
      kind: "modified",
      id: "3",
      path: "App › Screens › Login › Button",
      trail: ["Screens", "Login", "Button"],
      props: [{ prop: "width", from: 3, to: 15 }],
    },
    { kind: "added", id: "5", path: "App › Screens › Login › Forgot", trail: ["Screens", "Login", "Forgot"], type: "text" },
    { kind: "removed", id: "6", path: "App › Screens › Home › Promo", trail: ["Screens", "Home", "Promo"], type: "text" },
  ];

  it("says so when nothing changed", () => {
    expect(formatText([])).toBe("No changes.\n");
  });

  it("groups changes by page and frame", () => {
    const out = formatText(changes);
    expect(out).toBe(
      [
        'Page "Screens"',
        '  Frame "Login"',
        "    ~ Button: width 3 → 15",
        "    + Forgot (text)",
        '  Frame "Home"',
        "    - Promo (text)",
        "",
        "3 changes in 2 frames (1 added, 1 removed, 1 property change)",
        "",
      ].join("\n"),
    );
  });

  it("labels changes on the frame and page themselves", () => {
    const out = formatText([
      { kind: "added", id: "7", path: "p", trail: ["Screens", "Settings"], type: "frame" },
      { kind: "reordered", id: "1", path: "q", trail: ["Screens"] },
    ]);
    expect(out).toContain("    + (frame itself) (frame)");
    expect(out).toContain("  ~ (page): layer order changed");
  });
});

describe("formatSummary", () => {
  it("uses singular forms", () => {
    expect(
      formatSummary({ changes: 1, frames: 1, added: 1, removed: 0, moved: 0, reordered: 0, modifiedNodes: 0, propertyChanges: 0 }),
    ).toBe("1 change in 1 frame (1 added)");
  });
});
