import { describe, expect, it } from "vitest";
// @ts-expect-error the website's modules are plain JavaScript without type declarations
import { assetsDir, parseManifest } from "../site/src/gh-manifest.js";

const head = "0123456789abcdef0123456789abcdef01234567";
const good = {
  version: 1,
  pr: 7,
  head,
  files: [
    {
      path: "design/app.figcraft",
      frames: [
        { page: "P", frame: "F", changedRatio: 0.25, before: "pr-7/01234567/f0-0-before.png", after: "pr-7/01234567/f0-0-after.png" },
      ],
    },
  ],
};

describe("the pictures manifest", () => {
  it("names the folder the Action writes", () => {
    expect(assetsDir(7, head)).toBe("pr-7/01234567");
  });

  it("accepts what the Action writes", () => {
    const files = parseManifest(good, 7, head);
    expect(files.get("design/app.figcraft")[0]).toMatchObject({ page: "P", frame: "F", changedRatio: 0.25 });
  });

  it("drops anything that is not a plain PNG in this pull request's folder", () => {
    const bad = structuredClone(good);
    const frame = bad.files[0]!.frames[0] as Record<string, unknown>;
    frame.before = "../../etc/passwd.png";
    frame.after = "pr-8/01234567/x.png";
    frame.diff = "https://example.com/x.png";
    expect(parseManifest(bad, 7, head)).toBeNull();
  });

  it("refuses a manifest for another pull request or commit", () => {
    expect(parseManifest(good, 8, head)).toBeNull();
    expect(parseManifest(good, 7, "ffffffff" + head.slice(8))).toBeNull();
    expect(parseManifest({ ...good, version: 2 }, 7, head)).toBeNull();
    expect(parseManifest(null, 7, head)).toBeNull();
    expect(parseManifest({ ...good, files: "x" }, 7, head)).toBeNull();
  });
});
