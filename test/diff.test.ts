import { describe, expect, it } from "vitest";
import { diffTrees } from "../src/diff/diff.js";
import { toDesignTree } from "../src/parser/index.js";

const before = toDesignTree({
  id: "root",
  type: "DOCUMENT",
  name: "App",
  children: [
    {
      id: "login",
      type: "FRAME",
      name: "Login",
      children: [
        { id: "btn", type: "RECTANGLE", name: "Sign in", fill: "#2563EB" },
        { id: "promo", type: "TEXT", name: "Promo", text: "Sale" },
      ],
    },
  ],
});

describe("diffTrees", () => {
  it("reports no changes for identical trees", () => {
    expect(diffTrees(before, before)).toEqual([]);
  });

  it("detects a modified property", () => {
    const after = toDesignTree({
      id: "root",
      type: "DOCUMENT",
      name: "App",
      children: [
        {
          id: "login",
          type: "FRAME",
          name: "Login",
          children: [
            { id: "btn", type: "RECTANGLE", name: "Sign in", fill: "#1D4ED8" },
            { id: "promo", type: "TEXT", name: "Promo", text: "Sale" },
          ],
        },
      ],
    });
    const changes = diffTrees(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "modified",
      id: "btn",
      props: [{ prop: "fill", from: "#2563EB", to: "#1D4ED8" }],
    });
  });

  it("detects added and removed nodes", () => {
    const after = toDesignTree({
      id: "root",
      type: "DOCUMENT",
      name: "App",
      children: [
        {
          id: "login",
          type: "FRAME",
          name: "Login",
          children: [
            { id: "btn", type: "RECTANGLE", name: "Sign in", fill: "#2563EB" },
            { id: "forgot", type: "TEXT", name: "Forgot password?" },
          ],
        },
      ],
    });
    const kinds = diffTrees(before, after).map((c) => c.kind).sort();
    expect(kinds).toEqual(["added", "removed"]);
  });

  it("detects a node moved to another parent", () => {
    const after = toDesignTree({
      id: "root",
      type: "DOCUMENT",
      name: "App",
      children: [
        { id: "login", type: "FRAME", name: "Login", children: [{ id: "btn", type: "RECTANGLE", name: "Sign in", fill: "#2563EB" }] },
        { id: "home", type: "FRAME", name: "Home", children: [{ id: "promo", type: "TEXT", name: "Promo", text: "Sale" }] },
      ],
    });
    const kinds = diffTrees(before, after).map((c) => c.kind);
    expect(kinds).toContain("moved");
    expect(kinds).toContain("added");
  });
});
