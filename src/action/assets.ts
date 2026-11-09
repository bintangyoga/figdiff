import { request, GitHubError, type GitHubApi } from "./github.js";

export interface AssetFile {
  /** Path inside the assets branch. */
  path: string;
  bytes: Uint8Array;
}

/** Decode a `data:image/png;base64,...` URI. Returns undefined for anything else. */
export function decodePngDataUri(uri: string | undefined): Uint8Array | undefined {
  const prefix = "data:image/png;base64,";
  if (!uri?.startsWith(prefix)) return undefined;
  return new Uint8Array(Buffer.from(uri.slice(prefix.length), "base64"));
}

/** URL that renders in a comment for people who can read the repository. */
export function assetUrl(serverUrl: string, repo: string, branch: string, path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${serverUrl}/${repo}/blob/${encodeURIComponent(branch)}/${encoded}?raw=true`;
}

/**
 * Add files to a branch with one commit, creating the branch (without any history from the
 * main code) if it does not exist yet. Works through the REST API, so no checkout is needed.
 */
export async function commitFiles(api: GitHubApi, repo: string, branch: string, files: AssetFile[], message: string): Promise<void> {
  let parent: string | undefined;
  let baseTree: string | undefined;
  try {
    const ref = await request<{ object: { sha: string } }>(api, "GET", `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    parent = ref.object.sha;
    const commit = await request<{ tree: { sha: string } }>(api, "GET", `/repos/${repo}/git/commits/${parent}`);
    baseTree = commit.tree.sha;
  } catch (err) {
    if (!(err instanceof GitHubError) || err.status !== 404) throw err;
  }

  const entries: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const f of files) {
    const blob = await request<{ sha: string }>(api, "POST", `/repos/${repo}/git/blobs`, {
      content: Buffer.from(f.bytes).toString("base64"),
      encoding: "base64",
    });
    entries.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await request<{ sha: string }>(api, "POST", `/repos/${repo}/git/trees`, {
    tree: entries,
    ...(baseTree ? { base_tree: baseTree } : {}),
  });
  const commit = await request<{ sha: string }>(api, "POST", `/repos/${repo}/git/commits`, {
    message,
    tree: tree.sha,
    parents: parent ? [parent] : [],
  });
  if (parent) {
    await request(api, "PATCH", `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  } else {
    await request(api, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  }
}
