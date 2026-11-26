// The list of pictures the figdiff GitHub Action saves for a pull request (see docs/action.md).
// It comes from a repository anyone could have written to, so it is checked strictly: only plain PNG paths in
// the expected folder are accepted, and everything else is dropped.

const PNG_PATH = /^pr-([1-9][0-9]{0,8})\/([0-9a-f]{8})\/[A-Za-z0-9._-]{1,100}\.png$/;
const MAX_FILES = 50;
const MAX_FRAMES = 200;

/** The folder the Action uses for a pull request at a commit, inside the assets branch. */
export const assetsDir = (number, headSha) => `pr-${number}/${headSha.slice(0, 8)}`;

/** A cleaned-up manifest for this pull request and commit, or null if it is not one. */
export function parseManifest(data, number, headSha) {
  if (!data || typeof data !== "object" || data.version !== 1 || data.pr !== number) return null;
  if (typeof data.head !== "string" || data.head.slice(0, 8) !== headSha.slice(0, 8) || !Array.isArray(data.files)) return null;
  const dir = assetsDir(number, headSha);
  const okPath = (p) => typeof p === "string" && PNG_PATH.test(p) && p.startsWith(`${dir}/`);
  const files = new Map();
  for (const f of data.files.slice(0, MAX_FILES)) {
    if (!f || typeof f !== "object" || typeof f.path !== "string" || !Array.isArray(f.frames)) continue;
    const frames = [];
    for (const fr of f.frames.slice(0, MAX_FRAMES)) {
      if (!fr || typeof fr !== "object") continue;
      const frame = { page: String(fr.page ?? "").slice(0, 200), frame: String(fr.frame ?? "").slice(0, 200) };
      if (typeof fr.changedRatio === "number" && fr.changedRatio >= 0 && fr.changedRatio <= 1) frame.changedRatio = fr.changedRatio;
      for (const kind of ["before", "after", "diff"]) if (okPath(fr[kind])) frame[kind] = fr[kind];
      if (frame.before || frame.after || frame.diff) frames.push(frame);
    }
    if (frames.length) files.set(f.path, frames);
  }
  return files.size ? files : null;
}
