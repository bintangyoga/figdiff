import { describe, expect, it } from "vitest";
import { escapeHtml, formatHtml, frameKey } from "../src/html.js";
import type { Change } from "../src/diff/types.js";

const modified: Change = {
  kind: "modified",
  id: "3",
  path: "App › Screens › Login › Button",
  trail: ["Screens", "Login", "Button"],
  props: [
    {
      prop: "fills",
      from: [{ type: "solid", color: { r: 1, g: 0, b: 0, a: 1 } }],
      to: [{ type: "solid", color: { r: 0, g: 0, b: 1, a: 1 } }],
    },
  ],
};
const added: Change = { kind: "added", id: "5", path: "p", trail: ["Screens", "Login", "Forgot"], type: "text" };

describe("escapeHtml", () => {
  it("escapes all special characters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("formatHtml", () => {
  it("is a complete, self-contained page", () => {
    const html = formatHtml([modified, added], { beforeName: "a.figcraft", afterName: "b.figcraft" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>figdiff report</title>");
    expect(html).toContain("a.figcraft");
    expect(html).toContain("2 changes in 1 frame");
    expect(html).not.toMatch(/<link |<script src=|@import/);
  });

  it("shows colors with swatches", () => {
    const html = formatHtml([modified]);
    expect(html).toContain('<span class="sw" style="background:#FF0000"></span><code>#FF0000</code>');
    expect(html).toContain("#0000FF");
  });

  it("says so when nothing changed", () => {
    expect(formatHtml([])).toContain("No changes.");
  });

  it("only offers filters for kinds that occur", () => {
    const html = formatHtml([added]);
    expect(html).toContain('data-kind="added" aria-pressed');
    expect(html).not.toContain('data-kind="removed" aria-pressed');
  });

  it("counts distinct nodes in a frame, not entries", () => {
    const reordered: Change = { kind: "reordered", id: "3", path: "p", trail: ["Screens", "Login", "Button"] };
    expect(formatHtml([modified, reordered])).toContain('<span class="count">1 node</span>');
  });

  it("escapes names coming from the design file", () => {
    const evil: Change = {
      kind: "added",
      id: "9",
      path: "p",
      trail: ["<script>alert(1)</script>", `"><img src=x onerror=alert(1)>`, "n"],
      type: "<b>",
    };
    const html = formatHtml([evil], { title: "<i>t</i>", beforeName: "<x>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<i>t</i>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  describe("images", () => {
    const key = frameKey("Screens", "Login");
    const ok = { before: "data:image/png;base64,AAAA", after: "https://example.com/after.png" };

    it("adds a before/after slider for a frame with images", () => {
      const html = formatHtml([modified], { images: { [key]: ok } });
      expect(html).toContain('class="cmp"');
      expect(html).toContain('src="data:image/png;base64,AAAA"');
    });

    it("shows a difference tab and the share of changed pixels", () => {
      const html = formatHtml([modified], { images: { [key]: { ...ok, diff: "data:image/png;base64,BBBB", changedRatio: 0.0312 } } });
      expect(html).toContain('data-view="diff"');
      expect(html).toContain('src="data:image/png;base64,BBBB"');
      expect(html).toContain("3.1% of pixels differ");
    });

    it("describes tiny and empty differences sensibly", () => {
      const at = (ratio: number) =>
        formatHtml([modified], { images: { [key]: { ...ok, diff: "data:image/png;base64,C", changedRatio: ratio } } });
      expect(at(0)).toContain("0% of pixels differ");
      expect(at(0.0002)).toContain("&lt;0.1% of pixels differ");
      expect(at(0.42)).toContain("42% of pixels differ");
    });

    it("shows a single image for a frame that exists on one side only", () => {
      const added = formatHtml([modified], { images: { [key]: { after: ok.before } } });
      expect(added).toContain("only in the new version");
      expect(added).not.toContain('class="cmp"');
      const removed = formatHtml([modified], { images: { [key]: { before: ok.before } } });
      expect(removed).toContain("only in the old version");
    });

    it("offers a side-by-side view without duplicating the image data", () => {
      const html = formatHtml([modified], { images: { [key]: ok } });
      expect(html).toContain('data-view="side"');
      expect(html.split("data:image/png;base64,AAAA").length - 1).toBe(1);
    });

    it("has no difference tab when no difference image is given", () => {
      expect(formatHtml([modified], { images: { [key]: ok } })).not.toContain('data-view="diff"');
    });

    it("adds no slider without images", () => {
      expect(formatHtml([modified])).not.toContain('class="cmp"');
    });

    it("refuses script-capable image sources", () => {
      const html = formatHtml([modified], {
        images: { [key]: { before: "javascript:alert(1)", after: ok.after } },
      });
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain('class="cmp"'); // the valid side is shown on its own
    });
  });
});
