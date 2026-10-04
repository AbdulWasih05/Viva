/** Reads a public GitHub repo through the REST API. Works without a token; GITHUB_TOKEN raises the rate limit. */
import type { RepoFile, RepoSource } from "./types";

export type GitHubRef = { owner: string; repo: string };

/** Accepts "https://github.com/owner/repo", with or without ".git" or a trailing path, and "owner/repo". */
export function parseGitHubUrl(input: string): GitHubRef | null {
  const trimmed = input.trim();
  const match =
    trimmed.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i) ??
    trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function githubJson<T>(path: string): Promise<T> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) throw new Error("Repository not found, or it is private.");
  if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit reached. Try again later or set GITHUB_TOKEN.");
  if (!res.ok) throw new Error(`GitHub API error ${res.status}.`);
  return (await res.json()) as T;
}

export async function loadGitHubRepo(url: string): Promise<RepoSource> {
  const ref = parseGitHubUrl(url);
  if (!ref) throw new Error("That does not look like a GitHub repository URL.");
  const { owner, repo } = ref;

  const info = await githubJson<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const branch = await githubJson<{ commit: { sha: string } }>(`/repos/${owner}/${repo}/branches/${info.default_branch}`);
  const sha = branch.commit.sha;
  const tree = await githubJson<{ tree: { path: string; type: string; size?: number }[] }>(
    `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
  );

  const files: RepoFile[] = tree.tree
    .filter((entry) => entry.type === "blob")
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
  const known = new Set(files.map((file) => file.path));

  return {
    id: `github:${owner}/${repo}`.toLowerCase(),
    label: `${owner}/${repo}`,
    files,
    origin: { kind: "github", owner, repo },
    async readFile(path) {
      // Only paths from the real tree are fetched, so a model-invented path can never reach the network.
      if (!known.has(path)) throw new Error(`Not a file in this repo: ${path}`);
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encoded}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Could not read ${path} (${res.status}).`);
      return res.text();
    },
  };
}
