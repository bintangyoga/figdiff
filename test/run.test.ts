import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import type { RunDeps } from "../src/run.js";
import { RendererUnavailableError } from "../src/render/figcraft-cli.js";
import { encodePng } from "../src/render/png.js";
import { solid } from "./helpers.js";

type Raw = Record<string, unknown>;

function figcraft(red: number, extraNode = false): Uint8Array {
  const nodes: Record<string, Raw> = {
    "1": { id: 1, name: "Screens", type: "page", children: [2] },
    "2": { id: 2, name: "Login", type: "frame", parent: 1, children: extraNode ? [3, 4] : [3], width: 100, height: 100 },
    "3": {
      id: 3, name: "Button", type: "rectangle", parent: 2, width: 10, height: 10,
      fills: [{ type: "solid", color: { r: red, g: 0, b: 0, a: 1 } }],
    },
  };
  if (extraNode) nodes["4"] = { id: 4, name: "Hint", type: "text", parent: 2, characters: "Hi" };
  const doc = { format: "figcraft", version: 1, name: "App", pages: [1], nodes };
  return zipSync({ "document.json": strToU8(JSON.stringify(doc)), "thumbnail.png": new Uint8Array([0]) });
}

let dir = "";
let a = "";
let same = "";
let b = "";
let notZip = "";

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "figdiff-"));
  a = join(dir, "a.figcraft");
  same = join(dir, "same.figcraft");
  b = join(dir, "b.figcraft");
  notZip = join(dir, "bad.figcraft");
  writeFileSync(a, figcraft(0.2));
  writeFileSync(same, figcraft(0.2));
  writeFileSync(b, figcraft(1, true));
  writeFileSync(notZip, "this is not a zip");
});

describe("run", () => {
  it("prints a grouped report for two real archives", () => {
    const r = run([a, b]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Page "Screens"');
    expect(r.stdout).toContain("~ Button: fills #330000 → #FF0000");
    expect(r.stdout).toContain("+ Hint (text)");
    expect(r.stdout).toContain("2 changes in 1 frame");
  });

  it("reports identical files", () => {
    expect(run([a, same])).toMatchObject({ code: 0, stdout: "No changes.\n" });
  });

  it("returns 1 for differences only with --exit-code", () => {
    expect(run([a, b, "--exit-code"]).code).toBe(1);
    expect(run([a, same, "--exit-code"]).code).toBe(0);
  });

  it("prints JSON with a summary", () => {
    const parsed = JSON.parse(run([a, b, "--json"]).stdout);
    expect(parsed.summary).toMatchObject({ changes: 2, frames: 1, added: 1, propertyChanges: 1 });
    expect(parsed.changes).toHaveLength(2);
  });

  it("fails clearly on a file that is not a .figcraft archive", () => {
    const r = run([a, notZip]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("figdiff:");
  });

  it("fails on a missing file", () => {
    expect(run([a, join(dir, "nope.figcraft")]).code).toBe(2);
  });

  it("returns an HTML report to write when --html is given", () => {
    const r = run([a, b, "--html", join(dir, "out", "report.html")]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Page "Screens"');
    expect(r.writes).toHaveLength(1);
    expect(r.writes[0]?.path).toBe(join(dir, "out", "report.html"));
    expect(r.writes[0]?.content).toContain("<!doctype html>");
    expect(r.writes[0]?.content).toContain("a.figcraft");
    expect(run([a, b]).writes).toEqual([]);
  });

  it("requires a path after --html", () => {
    expect(run([a, b, "--html"]).stderr).toContain("--html needs a file path");
    expect(run([a, b, "--html", "--json"]).code).toBe(2);
  });

  describe("--images", () => {
    const red = encodePng(solid(4, 4, [255, 0, 0, 255]));
    const blue = encodePng(solid(4, 4, [0, 0, 255, 255]));
    const withRenderer = (renderFrame: (file: string) => Uint8Array | undefined): RunDeps => ({
      createRenderer: () => ({ renderFrame: (file) => renderFrame(file) }),
    });
    const html = join(dir, "out", "images.html");

    it("needs --html", () => {
      expect(run([a, b, "--images"]).stderr).toContain("--images needs --html");
    });

    it("only accepts --figcraft-cli together with --images", () => {
      expect(run([a, b, "--html", html, "--figcraft-cli", "/x"]).stderr).toContain("--figcraft-cli needs --images");
    });

    it("embeds rendered before/after images and a difference view", () => {
      const r = run([a, b, "--html", html, "--images"], withRenderer((file) => (file === a ? red : blue)));
      expect(r.code).toBe(0);
      const page = r.writes[0]?.content ?? "";
      expect(page).toContain('class="cmp"');
      expect(page).toContain("data:image/png;base64,");
      expect(page).toContain("of pixels differ");
    });

    it("passes --figcraft-cli through to the renderer lookup", () => {
      let asked: string | undefined;
      run([a, b, "--html", html, "--images", "--figcraft-cli", "/opt/fc"], {
        createRenderer: (path) => { asked = path; return undefined; },
      });
      expect(asked).toBe("/opt/fc");
    });

    it("still writes the report, with a warning, when figcraft-cli is not found", () => {
      const r = run([a, b, "--html", html, "--images"], { createRenderer: () => undefined });
      expect(r.code).toBe(0);
      expect(r.stderr).toContain("figcraft-cli not found");
      expect(r.writes[0]?.content).not.toContain('class="cmp"');
    });

    it("still writes the report when running figcraft-cli fails", () => {
      const r = run([a, b, "--html", html, "--images"], {
        createRenderer: () => ({ renderFrame: () => { throw new RendererUnavailableError("Cannot run fc"); } }),
      });
      expect(r.code).toBe(0);
      expect(r.stderr).toContain("Cannot run fc");
      expect(r.writes).toHaveLength(1);
    });

    it("does not look for figcraft-cli unless asked", () => {
      let called = false;
      run([a, b, "--html", html], { createRenderer: () => { called = true; return undefined; } });
      expect(called).toBe(false);
    });
  });

  it("shows usage for wrong arguments and unknown options", () => {
    expect(run([a]).code).toBe(2);
    expect(run([a, b, "--nope"]).stderr).toContain("unknown option");
    expect(run(["--help"])).toMatchObject({ code: 0 });
  });
});
