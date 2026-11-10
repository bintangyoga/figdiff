import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareFigcraft } from "../src/browser.js";
import { parseFigcraftBytes } from "../src/parser/bytes.js";
import { makeFigcraft } from "./helpers.js";

describe("compareFigcraft (browser entry)", () => {
  it("compares two archives from bytes", () => {
    const r = compareFigcraft(makeFigcraft(0.2), makeFigcraft(1, true), { beforeName: "a.figcraft", afterName: "b.figcraft" });
    expect(r.summary.changes).toBe(2);
    expect(r.text).toContain("~ Button: fills #330000 → #FF0000");
    expect(r.text).toContain("+ Hint (text)");
    expect(JSON.parse(r.json).changes).toHaveLength(2);
    expect(r.html).toContain("a.figcraft");
    expect(r.html).toContain("b.figcraft");
  });

  it("reports nothing for identical files", () => {
    const r = compareFigcraft(makeFigcraft(0.2), makeFigcraft(0.2));
    expect(r.summary.changes).toBe(0);
  });

  it("applies the tolerance to design nodes", () => {
    const r = compareFigcraft(makeFigcraft(0.2), makeFigcraft(0.25), { tolerance: 0.1 });
    expect(r.summary.changes).toBe(0);
  });

  it("names the file in errors", () => {
    expect(() => parseFigcraftBytes(new TextEncoder().encode("nope"), "x.figcraft")).toThrow(/x\.figcraft: not a zip/);
    expect(() => compareFigcraft(new Uint8Array(0), makeFigcraft(0.2), { beforeName: "empty.figcraft" })).toThrow(/empty\.figcraft/);
  });

  it("does not import Node APIs", () => {
    // The browser bundle is served as plain modules; a node: import would break it.
    const files = ["browser", "parser/bytes", "parser/document", "parser/tokens", "parser/defaults", "report", "html", "diff/diff", "diff/tokens", "diff/summary"];
    for (const f of files) {
      expect(readFileSync(new URL(`../src/${f}.ts`, import.meta.url), "utf8"), f).not.toMatch(/from "node:/);
    }
  });
});
