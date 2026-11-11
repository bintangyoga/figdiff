import { describe, expect, it } from "vitest";
import { documentToTree } from "../src/parser/document.js";
import { diffTrees } from "../src/diff/diff.js";
import { changeBoxes, locateChanges } from "../src/render/boxes.js";
import { createCliRenderer } from "../src/render/figcraft-cli.js";
import { formatHtml, frameKey } from "../src/html.js";

type Raw = Record<string, unknown>;
const at = (x: number, y: number) => [1, 0, 0, 1, x, y];

function design(edit: (n: Record<string, Raw>) => void = () => {}) {
  const nodes: Record<string, Raw> = {
    "1": { id: 1, name: "Screens", type: "page", children: [2] },
    "2": { id: 2, name: "Login", type: "frame", parent: 1, width: 400, height: 800, transform: at(100, 50), children: [3, 5] },
    "3": { id: 3, name: "Card", type: "frame", parent: 2, width: 200, height: 100, transform: at(20, 40), children: [4] },
    "4": { id: 4, name: "Button", type: "rectangle", parent: 3, width: 100, height: 40, transform: at(10, 20), fills: [] },
    "5": { id: 5, name: "List", type: "frame", parent: 2, width: 400, height: 200, transform: at(0, 400), layout: { mode: "vertical" }, children: [6] },
    "6": { id: 6, name: "Row", type: "rectangle", parent: 5, width: 400, height: 50, fills: [] },
  };
  edit(nodes);
  return documentToTree({ format: "figcraft", version: 1, name: "T", pages: [1], nodes });
}

describe("changeBoxes", () => {
  it("adds up positions inside the frame", () => {
    const before = design();
    const after = design((n) => (n["4"].width = 120));
    const boxes = changeBoxes(before, after, diffTrees(before, after));
    expect(boxes["4"]).toEqual({ x: 30 / 400, y: 60 / 800, w: 120 / 400, h: 40 / 800 });
  });

  it("does not guess where auto layout puts a node", () => {
    const before = design();
    const after = design((n) => (n["6"].height = 60));
    expect(changeBoxes(before, after, diffTrees(before, after))["6"]).toBeUndefined();
  });

  it("does not place rotated nodes", () => {
    const before = design();
    const after = design((n) => (n["4"].transform = [0, 1, -1, 0, 10, 20]));
    expect(changeBoxes(before, after, diffTrees(before, after))["4"]).toBeUndefined();
  });
});

describe("locateChanges", () => {
  it("uses positions from figcraft-cli for nodes in auto layout", () => {
    const before = design();
    const after = design((n) => (n["6"].height = 60));
    const asked: string[][] = [];
    const renderer = {
      renderFrame: () => undefined,
      bounds: (_file: string, ids: string[]) => {
        asked.push(ids);
        return new Map([
          ["2", { x: 100, y: 50, width: 400, height: 800 }],
          ["6", { x: 100, y: 450, width: 400, height: 60 }],
        ]);
      },
    };
    const boxes = locateChanges(before, after, diffTrees(before, after), { before: "a", after: "b" }, renderer);
    expect(asked).toEqual([["6", "2"]]);
    expect(boxes["6"]).toEqual({ x: 0, y: 0.5, w: 1, h: 60 / 800 });
  });
});

describe("figcraft-cli bounds", () => {
  it("runs a node.get script and reads absoluteBounds from each step", () => {
    let args: string[] = [];
    const out = [
      JSON.stringify({ step: 0, command: "node.get", ok: true, result: { id: 6, absoluteBounds: { x: 1, y: 2, width: 3, height: 4 } } }),
      JSON.stringify({ step: 1, command: "node.get", ok: true, result: { id: 2 } }),
      "not json",
    ].join("\n");
    const renderer = createCliRenderer("figcraft-cli", () => {}, (_cmd, a) => ((args = a), out));
    const bounds = renderer.bounds?.("file.figcraft", ["6", "2"]);
    expect(args.slice(0, 1)).toEqual(["run"]);
    expect(args.slice(2)).toEqual(["--in", "file.figcraft"]);
    expect(bounds?.get("6")).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    expect(bounds?.has("2")).toBe(false);
  });

  it("returns nothing when the program fails", () => {
    const renderer = createCliRenderer("figcraft-cli", () => {}, () => {
      throw Object.assign(new Error("boom"), { stderr: "error: no such node" });
    });
    expect(renderer.bounds?.("f", ["1"]).size).toBe(0);
    expect(renderer.lastError).toBe("error: no such node");
  });
});

describe("highlights in the HTML report", () => {
  it("draws a box for located changes and links the row to it", () => {
    const before = design();
    const after = design((n) => (n["4"].width = 120));
    const changes = diffTrees(before, after);
    const images = { [frameKey("Screens", "Login")]: { before: "data:image/png;base64,AA==", after: "data:image/png;base64,AA==", width: 400 } };
    const html = formatHtml(changes, { images, boxes: changeBoxes(before, after, changes) });
    expect(html).toContain('data-hl="4"');
    expect(html).toContain('data-node="4"');
    expect(html).toContain("--w:400px");
    expect(html).toContain('<main class="wide">');
  });

  it("leaves rows plain without images", () => {
    const before = design();
    const after = design((n) => (n["4"].width = 120));
    const changes = diffTrees(before, after);
    expect(formatHtml(changes, { boxes: changeBoxes(before, after, changes) })).not.toContain("data-node=");
  });
});
