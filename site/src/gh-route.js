// Reads a /gh/... address. Pure functions, so they can be tested without a browser.
//
//   /gh/                              the start page (paste a GitHub address)
//   /gh/<owner>/<repo>                the .figcraft files at the default branch
//   /gh/<owner>/<repo>/tree/<ref>     the same at a branch, tag or commit
//   /gh/<owner>/<repo>/blob/<ref>/<path>   one design (use ?ref= when the ref contains a slash)
//   /gh/<owner>/<repo>/compare/<base>...<head>
//   /gh/<owner>/<repo>/pull/<number>

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
// A ref is a branch, tag or commit. No spaces or control characters, and none of git's forbidden characters.
// eslint-disable-next-line no-control-regex
const REF = /^[^\s\u0000-\u001f\u007f~^:?*[\\]{1,200}$/;

export const isOwner = (s) => OWNER.test(s);
export const isRepo = (s) => REPO.test(s) && s !== "." && s !== ".." && !s.endsWith(".git");
export const isRef = (s) => REF.test(s) && !s.includes("..") && !s.startsWith("/") && !s.endsWith("/") && !s.endsWith(".lock");
export const isPath = (s) =>
  s.length > 0 && s.length <= 1024 && s.split("/").every((p) => p !== "" && p !== "." && p !== "..") && !/[\u0000-\u001f]/.test(s); // eslint-disable-line no-control-regex

/** The route for a path (and optional query string), or `{ view: "invalid", message }`. */
export function parseRoute(pathname, search = "") {
  const parts = pathname
    .replace(/^\/gh\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(safeDecode);
  if (parts.length === 0) return { view: "home" };
  const [owner, repo, kind, ...rest] = parts;
  if (!isOwner(owner ?? "")) return bad(`“${owner}” is not a GitHub user or organization name.`);
  if (repo === undefined) return bad("Add the repository name: /gh/<owner>/<repo>.");
  if (!isRepo(repo)) return bad(`“${repo}” is not a valid repository name.`);
  const base = { owner, repo };
  const q = new URLSearchParams(search);
  const queryRef = q.get("ref");
  if (queryRef !== null && !isRef(queryRef)) return bad("The ref in the address is not valid.");

  if (kind === undefined) return { view: "repo", ...base, ref: queryRef };
  if (kind === "tree") {
    const ref = queryRef ?? rest.join("/");
    if (!ref) return { view: "repo", ...base, ref: null };
    return isRef(ref) ? { view: "repo", ...base, ref } : bad("The branch, tag or commit in the address is not valid.");
  }
  if (kind === "blob") {
    // With ?ref=, everything after "blob/" is the path. Without it, the first segment is the ref.
    const ref = queryRef ?? rest[0];
    const path = (queryRef !== null ? rest : rest.slice(1)).join("/");
    if (!ref || !path) return bad("Use /blob/<ref>/<path> (or ?ref= when the branch name contains a slash).");
    if (!isRef(ref)) return bad("The branch, tag or commit in the address is not valid.");
    if (!isPath(path)) return bad("The file path in the address is not valid.");
    return { view: "blob", ...base, ref, path };
  }
  if (kind === "compare") {
    const [a, b] = rest.join("/").split("...");
    if (!a || !b || !isRef(a) || !isRef(b)) return bad("Use /compare/<base>...<head> with two branches, tags or commits.");
    return { view: "compare", ...base, base: a, head: b };
  }
  if (kind === "pull" || kind === "pulls") {
    const n = rest[0] ?? "";
    return /^[1-9][0-9]{0,8}$/.test(n) ? { view: "pull", ...base, number: Number(n) } : bad("Use /pull/<number>.");
  }
  return bad("This address is not supported yet. Try a repository, a pull request or a compare link.");
}

function bad(message) {
  return { view: "invalid", message };
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The /gh/ address for a route. */
export function routeUrl(r) {
  const seg = (s) => s.split("/").map(encodeURIComponent).join("/");
  const root = `/gh/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.repo)}`;
  switch (r.view) {
    case "repo":
      return r.ref ? `${root}?ref=${encodeURIComponent(r.ref)}` : root;
    case "blob":
      return r.ref.includes("/")
        ? `${root}/blob/${seg(r.path)}?ref=${encodeURIComponent(r.ref)}`
        : `${root}/blob/${encodeURIComponent(r.ref)}/${seg(r.path)}`;
    case "compare":
      return `${root}/compare/${seg(r.base)}...${seg(r.head)}`;
    case "pull":
      return `${root}/pull/${r.number}`;
    default:
      return "/gh/";
  }
}

/**
 * Turns what a person pastes into a route: `owner/repo`, a github.com address (repository, tree, blob,
 * compare or pull request), or an address on this site. Returns null when it is not recognised.
 */
export function routeFromInput(text) {
  const t = text.trim();
  if (!t) return null;
  let path = t;
  let search = "";
  try {
    const u = new URL(
      /^[a-z]+:\/\//i.test(t) ? t : `https://${t.startsWith("github.com") || t.startsWith("www.github.com") ? t : `github.com/${t}`}`,
    );
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com" && u.pathname.startsWith("/gh/")) {
      const r = parseRoute(u.pathname, u.search);
      return r.view === "invalid" ? null : r;
    }
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    path = u.pathname;
    search = u.search;
  } catch {
    return null;
  }
  const r = parseRoute(`/gh${path.replace(/\/+$/, "")}`, search);
  return r.view === "invalid" || r.view === "home" ? null : r;
}
