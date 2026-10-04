/**
 * Reads Entire checkpoints from a public GitHub repo through the REST API (hosted mode).
 * Checkpoint refs are not branches, but GitHub serves them like any other ref (DECISIONS D22).
 */
import { checkpointIdFromMessage, parseCheckpointInfo, parseUserPrompts, type LinkedCommit, type ProvenanceInput } from "./parse";

/** Limits that keep one ingest from using up the GitHub rate limit (60 requests/hour without a token). */
const MAX_CHECKPOINTS = 12;
const MAX_LINKED_COMMITS = 12;
const MAX_BRANCHES = 5;
/** A transcript larger than this is skipped; the prompt then reads "could not be read". */
const MAX_TRANSCRIPT_BYTES = 8 * 1024 * 1024;

async function api<T>(path: string): Promise<T | null> {
  const headers: Record<string, string> = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(20_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

type TreeEntry = { path: string; type: string; sha: string; size?: number };

async function readBlob(repo: string, sha: string): Promise<string | null> {
  const blob = await api<{ content: string; encoding: string }>(`/repos/${repo}/git/blobs/${sha}`);
  if (!blob || blob.encoding !== "base64") return null;
  return Buffer.from(blob.content, "base64").toString("utf8");
}

export async function readGitHubCheckpoints(owner: string, name: string): Promise<ProvenanceInput> {
  const repo = `${owner}/${name}`;
  const empty: ProvenanceInput = { checkpoints: [], commits: [], promptsBySession: {} };

  const refs = await api<{ ref: string; object: { sha: string } }[]>(`/repos/${repo}/git/matching-refs/entire/checkpoints`);
  if (!refs || refs.length === 0) return empty;

  // Checkpoint ids are ULIDs, which sort by time, so the last ones are the newest.
  const newest = [...refs].sort((a, b) => idOf(a.ref).localeCompare(idOf(b.ref))).slice(-MAX_CHECKPOINTS);

  const checkpoints = [];
  const transcriptBlob = new Map<string, TreeEntry>();
  for (const ref of newest) {
    const id = idOf(ref.ref);
    const tree = await api<{ tree: TreeEntry[] }>(`/repos/${repo}/git/trees/${ref.object.sha}?recursive=1`);
    if (!tree) continue;
    const blobOf = (path: string) => tree.tree.find((entry) => entry.path === path && entry.type === "blob");
    const root = blobOf("metadata.json");
    const session = blobOf("0/metadata.json");
    const info = parseCheckpointInfo(id, root ? await readBlob(repo, root.sha) : null, session ? await readBlob(repo, session.sha) : null);
    if (!info) continue;
    checkpoints.push(info);
    const transcript = blobOf("0/transcript.jsonl");
    if (transcript) transcriptBlob.set(id, transcript);
  }

  // Recent commits on the default branch and on a few other branches (work in open pull requests
  // counts too). The trailer in the message links a commit to its checkpoint.
  type ApiCommit = { sha: string; commit: { message: string } };
  const recent = new Map<string, ApiCommit>();
  const branches = (await api<{ name: string }[]>(`/repos/${repo}/branches?per_page=${MAX_BRANCHES}`)) ?? [];
  for (const source of ["", ...branches.map((branch) => branch.name)].slice(0, MAX_BRANCHES + 1)) {
    const query = source ? `sha=${encodeURIComponent(source)}&per_page=30` : "per_page=100";
    for (const commit of (await api<ApiCommit[]>(`/repos/${repo}/commits?${query}`)) ?? []) recent.set(commit.sha, commit);
  }

  const commits: LinkedCommit[] = [];
  for (const commit of recent.values()) {
    const checkpointId = checkpointIdFromMessage(commit.commit.message);
    if (!checkpointId || commits.length >= MAX_LINKED_COMMITS) continue;
    const detail = await api<{ files?: { filename: string }[] }>(`/repos/${repo}/commits/${commit.sha}`);
    commits.push({ sha: commit.sha, checkpointId, files: (detail?.files ?? []).map((file) => file.filename) });
  }

  // One transcript per session: the newest checkpoint's transcript contains the whole session.
  const promptsBySession: ProvenanceInput["promptsBySession"] = {};
  for (const checkpoint of [...checkpoints].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (promptsBySession[checkpoint.sessionId]) continue;
    const blob = transcriptBlob.get(checkpoint.id);
    const text = blob && (blob.size ?? 0) <= MAX_TRANSCRIPT_BYTES ? await readBlob(repo, blob.sha) : null;
    promptsBySession[checkpoint.sessionId] = text ? parseUserPrompts(text) : [];
  }

  return { checkpoints, commits, promptsBySession };
}

function idOf(ref: string): string {
  return ref.split("/").pop() ?? "";
}
