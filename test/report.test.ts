import { describe, expect, it } from "vitest";
import { formatText, formatValue } from "../src/report.js";

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
  it("says so when nothing changed", () => {
    expect(formatText([])).toBe("No changes.\n");
  });

  it("prints a modified property on one line", () => {
    const out = formatText([
      { kind: "modified", id: "1", path: "A › B", props: [{ prop: "width", from: 3, to: 15 }] },
    ]);
    expect(out).toContain("~ A › B: width 3 → 15");
    expect(out).toContain("1 changed node");
  });
});
