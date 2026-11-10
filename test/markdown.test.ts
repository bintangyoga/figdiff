import { describe, expect, it } from "vitest";
// @ts-expect-error plain JavaScript module used by the site build
import { inline, markdownToHtml } from "../scripts/markdown.mjs";

describe("markdown converter", () => {
  it("renders headings with ids, and returns the title and the h2 list", () => {
    const r = markdownToHtml("# Title\n\nIntro\n\n## First part\n\n### Detail\n\n## First part\n");
    expect(r.title).toBe("Title");
    expect(r.html).not.toContain("<h1");
    expect(r.html).toContain('<h2 id="first-part">');
    expect(r.html).toContain('<h2 id="first-part-2">');
    expect(r.headings.map((h: { id: string }) => h.id)).toEqual(["first-part", "first-part-2"]);
  });

  it("escapes HTML and keeps code verbatim", () => {
    expect(inline("a <b> & `<i>`")).toBe("a &lt;b&gt; &amp; <code>&lt;i&gt;</code>");
    const r = markdownToHtml("```sh\nnpx figdiff <a> <b>\n```\n");
    expect(r.html).toContain("<code>npx figdiff &lt;a&gt; &lt;b&gt;</code>");
    expect(r.html).toContain('data-lang="sh"');
  });

  it("renders tables, lists and block quotes", () => {
    const table = markdownToHtml("| A | B |\n| --- | --- |\n| `x` | y \\| z |\n").html;
    expect(table).toContain("<th>A</th>");
    expect(table).toContain('<td data-label="A"><code>x</code></td>');
    expect(table).toContain('<td data-label="B">y | z</td>');
    expect(markdownToHtml("- one\n- two\n").html).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(markdownToHtml("1. a\n2. b\n").html).toBe("<ol><li>a</li><li>b</li></ol>");
    expect(markdownToHtml("> note here\n").html).toContain("<blockquote>");
  });

  it("handles bold, italics and links, and rewrites link targets", () => {
    const html = inline("**bold** and *it* and [docs](cli.md)", (h: string) => h.replace(/\.md$/, ".html"));
    expect(html).toBe('<strong>bold</strong> and <em>it</em> and <a href="cli.html">docs</a>');
    expect(inline("[x](https://example.com)")).toContain('rel="noopener"');
  });

  it("does not pass raw HTML through", () => {
    expect(markdownToHtml("<script>alert(1)</script>\n").html).not.toContain("<script>");
  });
});
