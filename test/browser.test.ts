import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
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

  it("applies the tolerance to sizes but not to colors", () => {
    const file = (width: number, red: number) => {
      const nodes = { "1": { id: 1, name: "P", type: "page", children: [2] }, "2": { id: 2, name: "Box", type: "rectangle", parent: 1, width, height: 10, fills: [{ type: "solid", color: { r: red, g: 0, b: 0, a: 1 } }] } };
      return zipSync({ "document.json": strToU8(JSON.stringify({ format: "figcraft", version: 1, name: "T", pages: [1], nodes })) });
    };
    expect(compareFigcraft(file(80, 0.2), file(80.3, 0.2), { tolerance: 0.5 }).summary.changes).toBe(0);
    expect(compareFigcraft(file(80, 0.2), file(80.3, 0.9), { tolerance: 0.5 }).summary.changes).toBe(1);
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
