import { describe, expect, it } from "vitest";
import { diffTokens } from "../src/diff/tokens.js";
import { summarize } from "../src/diff/summary.js";
import { documentToTokens } from "../src/parser/tokens.js";
import { formatSummary, formatText } from "../src/report.js";
import { formatHtml } from "../src/html.js";

const color = (r: number, g: number, b: number) => ({ type: "color", value: { r, g, b, a: 1 } });

function doc(opts: { bg?: [number, number, number]; extraVar?: boolean; renameStyle?: boolean; dropStyle?: boolean } = {}) {
  const variables = [
    {
      id: "VariableID:1", name: "color/bg", collection: "VariableCollectionId:1", resolvedType: "color", description: "",
      values: { "VariableCollectionId:1/mode1": color(...(opts.bg ?? [1, 1, 1])), "VariableCollectionId:1/mode2": color(0, 0, 0) },
    },
    ...(opts.extraVar
      ? [{ id: "VariableID:2", name: "space/s", collection: "VariableCollectionId:1", resolvedType: "float", description: "", values: { "VariableCollectionId:1/mode1": { type: "float", value: 8 } } }]
      : []),
  ];
  const styles = opts.dropStyle ? [] : [{ id: "S:1", name: opts.renameStyle ? "Pine/500" : "Pine/50", description: "", type: "paint", paints: [] }];
  return {
    format: "figcraft", version: 1, name: "T", pages: [], nodes: {},
    variables: { collections: [{ id: "VariableCollectionId:1", name: "Theme", modes: [{ id: "VariableCollectionId:1/mode1", name: "Light" }, { id: "VariableCollectionId:1/mode2", name: "Dark" }] }], variables },
    styles,
  };
}

describe("documentToTokens", () => {
  it("reads collections, variables (by mode name) and styles", () => {
    const tokens = documentToTokens(doc());
    expect(tokens.map((t) => `${t.entity}:${t.name}`)).toEqual(["collection:Theme", "variable:color/bg", "style:Pine/50"]);
    const v = tokens.find((t) => t.entity === "variable");
    expect(v?.props.collection).toBe("Theme");
    expect(Object.keys(v?.props ?? {})).toContain("value Light");
    expect(Object.keys(v?.props ?? {})).toContain("value Dark");
  });

  it("copes with documents that have none", () => {
    expect(documentToTokens({ format: "figcraft" })).toEqual([]);
    expect(documentToTokens(null)).toEqual([]);
    expect(documentToTokens({ variables: { collections: "x", variables: 5 }, styles: [1, null] })).toEqual([]);
  });
});

describe("diffTokens", () => {
  it("reports nothing for identical documents", () => {
    expect(diffTokens(documentToTokens(doc()), documentToTokens(doc()))).toEqual([]);
  });

  it("reports a changed value in one mode", () => {
    const changes = diffTokens(documentToTokens(doc()), documentToTokens(doc({ bg: [0.5, 0.5, 0.5] })));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "modified", entity: "variable", name: "color/bg" });
    const props = (changes[0] as { props: { prop: string }[] }).props.map((p) => p.prop);
    expect(props).toEqual(["value Light"]);
  });

  it("reports added, removed and renamed tokens", () => {
    const base = documentToTokens(doc());
    const added = diffTokens(base, documentToTokens(doc({ extraVar: true })));
    expect(added).toEqual([{ kind: "added", entity: "variable", id: "VariableID:2", name: "space/s", detail: "Theme, float" }]);
    const removed = diffTokens(base, documentToTokens(doc({ dropStyle: true })));
    expect(removed).toEqual([{ kind: "removed", entity: "style", id: "S:1", name: "Pine/50", detail: "paint" }]);
    const renamed = diffTokens(base, documentToTokens(doc({ renameStyle: true })));
    expect(renamed[0]).toMatchObject({ kind: "modified", name: "Pine/500" });
    expect((renamed[0] as { props: { prop: string; from: unknown; to: unknown }[] }).props).toEqual([{ prop: "name", from: "Pine/50", to: "Pine/500" }]);
  });
});

describe("reporting tokens", () => {
  const changes = diffTokens(documentToTokens(doc()), documentToTokens(doc({ bg: [0.5, 0.5, 0.5], extraVar: true })));

  it("prints a Variables and styles section and counts token changes", () => {
    const text = formatText([], changes);
    expect(text).toContain("Variables and styles");
    expect(text).toContain('~ Variable "color/bg": value Light #FFFFFF → #808080');
    expect(text).toContain('+ Variable "space/s" (Theme, float)');
    expect(text).toContain("2 changes (2 token changes)");
  });

  it("still says 'No changes.' when nothing changed anywhere", () => {
    expect(formatText([], [])).toBe("No changes.\n");
  });

  it("adds tokenChanges to the summary only when there are some", () => {
    expect(summarize([], changes).tokenChanges).toBe(2);
    expect(summarize([], [])).not.toHaveProperty("tokenChanges");
    expect(formatSummary(summarize([], changes))).toBe("2 changes (2 token changes)");
  });

  it("shows tokens in the HTML report, escaped", () => {
    const html = formatHtml([], { tokens: [{ kind: "added", entity: "style", id: "S:9", name: "<b>x</b>", detail: "paint" }] });
    expect(html).toContain("Variables and styles");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("No changes.");
  });
});
