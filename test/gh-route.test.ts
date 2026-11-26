import { describe, expect, it } from "vitest";
// @ts-expect-error the website's modules are plain JavaScript without type declarations
import { parseRoute, routeFromInput, routeUrl } from "../site/src/gh-route.js";

describe("/gh/ addresses", () => {
  it("reads each kind of address", () => {
    expect(parseRoute("/gh/")).toEqual({ view: "home" });
    expect(parseRoute("/gh/acme/app")).toEqual({ view: "repo", owner: "acme", repo: "app", ref: null });
    expect(parseRoute("/gh/acme/app/tree/dev")).toMatchObject({ view: "repo", ref: "dev" });
    expect(parseRoute("/gh/acme/app/blob/main/design/home.figcraft")).toEqual({
      view: "blob",
      owner: "acme",
      repo: "app",
      ref: "main",
      path: "design/home.figcraft",
    });
    expect(parseRoute("/gh/acme/app/blob/design/home.figcraft", "?ref=feature%2Fx")).toMatchObject({
      ref: "feature/x",
      path: "design/home.figcraft",
    });
    expect(parseRoute("/gh/acme/app/compare/main...feature/x")).toMatchObject({ view: "compare", base: "main", head: "feature/x" });
    expect(parseRoute("/gh/acme/app/pull/12")).toMatchObject({ view: "pull", number: 12 });
  });

  it("refuses names and paths that could not be GitHub's", () => {
    for (const p of [
      "/gh/-bad/app",
      "/gh/acme/..",
      "/gh/acme/app/pull/0",
      "/gh/acme/app/pull/x",
      "/gh/acme/app/blob/main/../secret.figcraft",
      "/gh/acme/app/compare/main",
      "/gh/acme/app/compare/a b...c",
      "/gh/acme/app/settings",
    ]) {
      expect(parseRoute(p).view, p).toBe("invalid");
    }
    expect(parseRoute("/gh/acme/app", "?ref=a..b").view).toBe("invalid");
  });

  it("turns pasted text into a route", () => {
    expect(routeFromInput("acme/app")).toMatchObject({ view: "repo", owner: "acme", repo: "app" });
    expect(routeFromInput("https://github.com/acme/app/pull/7/files")).toMatchObject({ view: "pull", number: 7 });
    expect(routeFromInput("github.com/acme/app/compare/main...dev")).toMatchObject({ view: "compare", base: "main", head: "dev" });
    expect(routeFromInput("https://example.com/acme/app")).toBeNull();
    expect(routeFromInput("   ")).toBeNull();
    expect(routeFromInput("not a repo")).toBeNull();
  });

  it("writes an address that reads back the same", () => {
    const routes = [
      { view: "repo", owner: "acme", repo: "app", ref: "dev" },
      { view: "blob", owner: "acme", repo: "app", ref: "main", path: "a b/c.figcraft" },
      { view: "blob", owner: "acme", repo: "app", ref: "feature/x", path: "c.figcraft" },
      { view: "compare", owner: "acme", repo: "app", base: "main", head: "feature/x" },
      { view: "pull", owner: "acme", repo: "app", number: 3 },
    ];
    for (const r of routes) {
      const [path, search = ""] = routeUrl(r).split("?");
      expect(parseRoute(path as string, search ? `?${search}` : ""), routeUrl(r)).toEqual(r);
    }
  });
});
