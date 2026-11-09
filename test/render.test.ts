import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCliRenderer, defaultExec, errorDetail, findFigcraftCli, RendererUnavailableError } from "../src/render/figcraft-cli.js";
import type { Exec, Renderer } from "../src/render/figcraft-cli.js";
import { renderChangedFrames } from "../src/render/frames.js";
import { frameKey } from "../src/html.js";
import { decodePng, encodePng } from "../src/render/png.js";
import type { Change } from "../src/diff/types.js";
import { solid } from "./helpers.js";

const notFound = Object.assign(new Error("spawn figcraft-cli ENOENT"), { code: "ENOENT" });
const outOf = (args: string[]) => args[args.indexOf("-o") + 1] as string;

describe("findFigcraftCli", () => {
  it("prefers an explicit path and does not fall back", () => {
    const tried: string[] = [];
    const exec: Exec = (cmd) => { tried.push(cmd); throw notFound; };
    expect(findFigcraftCli("/opt/fc", exec, { FIGCRAFT_CLI: "/env/fc" })).toBeUndefined();
    expect(tried).toEqual(["/opt/fc"]);
  });

  it("falls back from the environment variable to the PATH", () => {
    const exec: Exec = (cmd) => { if (cmd === "/env/fc") throw notFound; };
    expect(findFigcraftCli(undefined, exec, { FIGCRAFT_CLI: "/env/fc" })).toBe("figcraft-cli");
  });

  it("counts a program that exists but dislikes --help as usable", () => {
    const exec: Exec = () => { throw new Error("exit status 2"); };
    expect(findFigcraftCli(undefined, exec, {})).toBe("figcraft-cli");
  });

  it("returns undefined when nothing can be started", () => {
    const exec: Exec = () => { throw notFound; };
    expect(findFigcraftCli(undefined, exec, {})).toBeUndefined();
  });
});

describe("createCliRenderer", () => {
  const png = encodePng(solid(2, 2, [9, 9, 9, 255]));

  it("asks figcraft-cli to export one named frame to PNG", () => {
    let seen: string[] = [];
    const exec: Exec = (_cmd, args) => { seen = args; writeFileSync(outOf(args), png); };
    const out = createCliRenderer("fc", exec).renderFrame("a.figcraft", "Screens", "Login", 2);
    expect(out && Array.from(out)).toEqual(Array.from(png));
    expect(seen.slice(0, 2)).toEqual(["export", "a.figcraft"]);
    expect(seen).toEqual(expect.arrayContaining(["--format", "png", "--scale", "2", "--page", "Screens", "--node", "Login"]));
  });

  it("retries with the frame name alone when --page is rejected", () => {
    const calls: string[][] = [];
    const exec: Exec = (_cmd, args) => {
      calls.push(args);
      if (args.includes("--page")) throw new Error("exit status 2");
      writeFileSync(outOf(args), png);
    };
    expect(createCliRenderer("fc", exec).renderFrame("a", "P", "F", 1)).toBeDefined();
    expect(calls).toHaveLength(2);
    expect(calls[1]).not.toContain("--page");
  });

  it("returns undefined when the frame cannot be exported", () => {
    const exec: Exec = () => { throw new Error("no such node"); };
    expect(createCliRenderer("fc", exec).renderFrame("a", "P", "F", 1)).toBeUndefined();
  });

  it("reports a missing program as unavailable", () => {
    const exec: Exec = () => { throw notFound; };
    expect(() => createCliRenderer("fc", exec).renderFrame("a", "P", "F", 1)).toThrow(RendererUnavailableError);
  });

  it("works with a real executable through the default runner", () => {
    const dir = mkdtempSync(join(tmpdir(), "figdiff-fake-"));
    const pngPath = join(dir, "canned.png");
    writeFileSync(pngPath, png);
    const script = join(dir, "figcraft-cli");
    writeFileSync(
      script,
      `#!/usr/bin/env node\nconst fs=require("fs");const a=process.argv.slice(2);\n` +
        `if(a.includes("--help"))process.exit(0);\nfs.copyFileSync(${JSON.stringify(pngPath)},a[a.indexOf("-o")+1]);\n`,
    );
    chmodSync(script, 0o755);
    expect(findFigcraftCli(script, defaultExec)).toBe(script);
    const out = createCliRenderer(script).renderFrame("any.figcraft", "P", "F", 1);
    expect(out && decodePng(out).width).toBe(2);
    expect(existsSync(script)).toBe(true);
  });
});

const change = (page: string, frame: string): Change => ({
  kind: "added", id: `${page}${frame}`, path: "p", trail: [page, frame, "x"], type: "text",
});

function fakeRenderer(files: Record<string, Record<string, Uint8Array>>): Renderer {
  return { renderFrame: (file, _page, frame) => files[file]?.[frame] };
}

describe("renderChangedFrames", () => {
  const a = encodePng(solid(4, 4, [0, 0, 0, 255]));
  const b = encodePng(solid(4, 4, [255, 255, 255, 255]));

  it("renders both sides, compares them and embeds data URIs", () => {
    const r = renderChangedFrames([change("S", "Login")], "old", "new", fakeRenderer({ old: { Login: a }, new: { Login: b } }));
    const img = r.images[frameKey("S", "Login")];
    expect(img?.before).toMatch(/^data:image\/png;base64,/);
    expect(img?.after).toMatch(/^data:image\/png;base64,/);
    expect(img?.diff).toMatch(/^data:image\/png;base64,/);
    expect(img?.changedRatio).toBe(1);
    expect(r.warnings).toEqual([]);
  });

  it("keeps only the existing side for an added or removed frame", () => {
    const r = renderChangedFrames([change("S", "New")], "old", "new", fakeRenderer({ old: {}, new: { New: b } }));
    const img = r.images[frameKey("S", "New")];
    expect(img?.before).toBeUndefined();
    expect(img?.after).toBeDefined();
    expect(img?.diff).toBeUndefined();
  });

  it("warns when a frame cannot be rendered in either file", () => {
    const r = renderChangedFrames([change("S", "Ghost")], "old", "new", fakeRenderer({ old: {}, new: {} }));
    expect(r.images).toEqual({});
    expect(r.warnings[0]).toContain('"Ghost"');
  });

  it("renders each frame once even with many changes, and honors maxFrames", () => {
    let calls = 0;
    const counting: Renderer = { renderFrame: () => { calls++; return a; } };
    const changes = [change("S", "A"), change("S", "A"), change("S", "B"), change("S", "C")];
    const r = renderChangedFrames(changes, "o", "n", counting, { maxFrames: 2 });
    expect(Object.keys(r.images)).toHaveLength(2);
    expect(calls).toBe(4); // 2 frames x 2 files
    expect(r.warnings[0]).toContain("2 of 3");
  });

  it("ignores changes that are not inside a frame", () => {
    const pageLevel: Change = { kind: "reordered", id: "1", path: "p", trail: ["S"] };
    expect(renderChangedFrames([pageLevel], "o", "n", fakeRenderer({})).images).toEqual({});
  });

  it("falls back to showing images when they cannot be decoded for comparison", () => {
    const junk = new Uint8Array([1, 2, 3]);
    const r = renderChangedFrames([change("S", "F")], "o", "n", fakeRenderer({ o: { F: junk }, n: { F: junk } }));
    const img = r.images[frameKey("S", "F")];
    expect(img?.before).toBeDefined();
    expect(img?.diff).toBeUndefined();
    expect(r.warnings[0]).toContain("Could not compare");
  });
});

describe("failure details", () => {
  it("takes the first line of stderr", () => {
    expect(errorDetail(Object.assign(new Error("exit 1"), { stderr: Buffer.from("\n  error: cannot open file\nmore\n") }))).toBe("error: cannot open file");
    expect(errorDetail(new Error("plain"))).toBe("plain");
  });

  it("keeps the renderer's reason in the warning", () => {
    const exec: Exec = () => { throw Object.assign(new Error("exit 1"), { stderr: "error: unsupported file version\n" }); };
    const renderer = createCliRenderer("fc", exec);
    const r = renderChangedFrames([{ kind: "removed", id: 1, trail: ["S", "Login"], path: "S/Login" } as never], "old", "new", renderer);
    expect(r.warnings[0]).toContain("figcraft-cli said: error: unsupported file version");
  });
});
