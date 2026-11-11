import { describe, expect, it } from "vitest";
import { assetUrl, commitFiles, decodePngDataUri } from "../src/action/assets.js";
import { buildComment } from "../src/action/comment.js";
import type { GitHubApi } from "../src/action/github.js";

const png = new Uint8Array([137, 80, 78, 71]);
const uri = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

function fakeApi(opts: { branchExists: boolean }) {
  const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    const path = url.replace("https://api.test", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
    calls.push({ method, path, body });
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (method === "GET" && path.includes("/git/ref/"))
      return opts.branchExists ? json({ object: { sha: "parent1" } }) : json({ message: "Not Found" }, 404);
    if (method === "GET" && path.includes("/git/commits/")) return json({ tree: { sha: "tree0" } });
    return json({ sha: `sha-${calls.length}` }, 201);
  }) as unknown as typeof fetch;
  const api: GitHubApi = { fetch: fetchFn, baseUrl: "https://api.test", token: "t" };
  return { api, calls };
}

describe("hosted images", () => {
  it("decodes PNG data URIs and rejects other input", () => {
    expect(decodePngDataUri(uri)).toEqual(png);
    expect(decodePngDataUri("data:image/svg+xml;base64,AAAA")).toBeUndefined();
    expect(decodePngDataUri(undefined)).toBeUndefined();
  });

  it("builds URLs that survive odd path characters", () => {
    expect(assetUrl("https://github.com", "o/r", "figdiff-assets", "pr-1/abc/f0-0-before.png")).toBe(
      "https://github.com/o/r/blob/figdiff-assets/pr-1/abc/f0-0-before.png?raw=true",
    );
    expect(assetUrl("https://github.com", "o/r", "a b", "x y/z.png")).toContain("a%20b/x%20y/z.png");
  });

  it("creates the branch when it does not exist", async () => {
    const { api, calls } = fakeApi({ branchExists: false });
    await commitFiles(api, "o/r", "figdiff-assets", [{ path: "a.png", bytes: png }], "msg");
    const commit = calls.find((c) => c.method === "POST" && c.path.endsWith("/git/commits"));
    expect(commit?.body?.parents).toEqual([]);
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/git/refs"))).toBe(true);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("adds a commit on top of an existing branch", async () => {
    const { api, calls } = fakeApi({ branchExists: true });
    await commitFiles(api, "o/r", "figdiff-assets", [{ path: "a.png", bytes: png }], "msg");
    const tree = calls.find((c) => c.path.endsWith("/git/trees"));
    expect(tree?.body?.base_tree).toBe("tree0");
    const commit = calls.find((c) => c.method === "POST" && c.path.endsWith("/git/commits"));
    expect(commit?.body?.parents).toEqual(["parent1"]);
    expect(calls.some((c) => c.method === "PATCH" && c.path.endsWith("/git/refs/heads/figdiff-assets"))).toBe(true);
  });

  it("shows before, after and difference in the comment, with names escaped", () => {
    const summary = { changes: 1, frames: 1, added: 0, removed: 0, moved: 0, reordered: 0, modifiedNodes: 1, propertyChanges: 1 };
    const body = buildComment(
      [
        {
          file: { status: "modified", path: "a.figcraft" },
          summary,
          frames: [{ name: 'P › <b>"x"', before: "https://u/b.png", after: "https://u/a.png", changedRatio: 0.0123 }],
        },
      ],
      { reportsUploaded: false },
    );
    expect(body).toContain('<img src="https://u/b.png" alt="before" width="220">');
    expect(body).toContain("1.2% changed");
    expect(body).toContain("&lt;b&gt;&quot;x&quot;");
    expect(body).not.toContain('<b>"x"');
  });
});
