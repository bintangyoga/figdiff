// A small client for the public GitHub API, for the browser. It reads, nothing else.
// Without a token GitHub allows 60 requests an hour per address, so the callers ask for as little as they can.

const API = "https://api.github.com";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export class GitHubError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.name = "GitHubError";
    /** "not-found" | "rate-limit" | "too-large" | "network" | "other" */
    this.kind = kind;
    this.status = status;
  }
}

const seg = (path) => path.split("/").map(encodeURIComponent).join("/");

export function createClient({ fetchImpl = (...a) => globalThis.fetch(...a), base = API } = {}) {
  async function request(url, accept) {
    let res;
    try {
      // Only the simple Accept header is sent, so the browser makes no CORS preflight request.
      res = await fetchImpl(url, { headers: { Accept: accept }, credentials: "omit", cache: "no-cache" });
    } catch {
      throw new GitHubError("Could not reach GitHub. Check your connection and try again.", "network");
    }
    if (res.ok) return res;
    if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      const at = reset ? new Date(reset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      throw new GitHubError(
        `GitHub allows 60 requests an hour without logging in, and that limit is used up${at ? `. Try again after ${at}` : ""}.`,
        "rate-limit",
        res.status,
      );
    }
    if (res.status === 404) {
      throw new GitHubError(
        "GitHub says this does not exist, or it is a private repository (private repositories are not supported yet).",
        "not-found",
        404,
      );
    }
    throw new GitHubError(`GitHub answered with an error (${res.status}).`, "other", res.status);
  }

  const json = async (path) => (await request(`${base}${path}`, "application/vnd.github+json")).json();

  return {
    async repo(owner, repo) {
      const r = await json(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
      return { defaultBranch: String(r.default_branch), isPrivate: Boolean(r.private), fullName: String(r.full_name) };
    },

    /** Paths of the .figcraft files at a ref. `truncated` is true when GitHub cut the list short. */
    async figcraftFiles(owner, repo, ref) {
      const t = await json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      );
      const files = (t.tree ?? [])
        .filter((e) => e.type === "blob" && /\.figcraft$/i.test(e.path))
        .map((e) => ({ path: String(e.path), size: Number(e.size ?? 0) }));
      return { files, truncated: Boolean(t.truncated) };
    },

    /** The .figcraft files that differ between two refs, with what happened to each. */
    async changedFiles(owner, repo, baseRef, headRef) {
      const c = await json(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(baseRef)}...${encodeURIComponent(headRef)}`,
      );
      const files = (c.files ?? [])
        .filter((f) => /\.figcraft$/i.test(f.filename))
        .map((f) => ({
          path: String(f.filename),
          status: String(f.status),
          previousPath: f.previous_filename ? String(f.previous_filename) : undefined,
        }));
      return { files, totalFiles: Number(c.files?.length ?? 0), aheadBy: Number(c.ahead_by ?? 0) };
    },

    async pull(owner, repo, number) {
      const p = await json(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`);
      return {
        title: String(p.title ?? ""),
        state: p.merged ? "merged" : String(p.state ?? ""),
        author: String(p.user?.login ?? ""),
        baseSha: String(p.base?.sha ?? ""),
        headSha: String(p.head?.sha ?? ""),
        baseRef: String(p.base?.ref ?? ""),
        headRef: String(p.head?.ref ?? ""),
      };
    },

    /** The bytes of one file at a ref, refusing anything larger than `maxBytes`. */
    async file(owner, repo, path, ref, maxBytes = MAX_FILE_BYTES) {
      const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${seg(path)}?ref=${encodeURIComponent(ref)}`;
      const res = await request(url, "application/vnd.github.raw+json");
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > maxBytes)
        throw new GitHubError(
          `${path} is larger than ${Math.round(maxBytes / 1048576)} MB, which is more than the browser view reads.`,
          "too-large",
        );
      const buf = await res.arrayBuffer();
      if (buf.byteLength > maxBytes)
        throw new GitHubError(
          `${path} is larger than ${Math.round(maxBytes / 1048576)} MB, which is more than the browser view reads.`,
          "too-large",
        );
      return new Uint8Array(buf);
    },
  };
}
