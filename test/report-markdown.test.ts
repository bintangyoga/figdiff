import { describe, expect, it } from "vitest";
import { code, formatMarkdown } from "../src/markdown.js";
import { run } from "../src/run.js";
import { makeFigcraft } from "./helpers.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareFigcraft } from "../src/browser.js";

describe("formatMarkdown", () => {
  it("says so when nothing changed", () => {
    expect(formatMarkdown([])).toBe("No changes.\n");
  });

  it("groups by page and frame and keeps names in code spans", () => {
    const md = formatMarkdown([
      { kind: "modified", id: "3", path: "App › P › F › *Bold* [x](http://evil)", trail: ["P", "F", "*Bold* [x](http://evil)"], props: [{ prop: "width", from: 10, to: 12 }] },
    ]);
    expect(md).toContain("### Page `P`");
    expect(md).toContain("#### Frame `F`");
    expect(md).toContain("- ✏️ `*Bold* [x](http://evil)` width: `10` → `12`");
  });

  it("handles backticks in names", () => {
    expect(code("a`b")).toBe("``a`b``");
    expect(code("`x`")).toBe("`` `x` ``");
  });
});

describe("--markdown", () => {
  const dir = mkdtempSync(join(tmpdir(), "figdiff-md-"));
  const a = join(dir, "a.figcraft");
  const b = join(dir, "b.figcraft");
  writeFileSync(a, makeFigcraft(1));
  writeFileSync(b, makeFigcraft(0.5, true));

  it("prints Markdown", () => {
    const r = run([a, b, "--markdown"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("#### Frame `Login`");
  });

  it("refuses --json together with --markdown", () => {
    expect(run([a, b, "--json", "--markdown"]).code).toBe(2);
  });

  it("is available in the browser result", () => {
    expect(compareFigcraft(makeFigcraft(1), makeFigcraft(0.5)).markdown).toContain("Button");
  });
});
