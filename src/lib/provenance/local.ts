/** Reads Entire checkpoints from a git repository on this machine, using plain git commands. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { checkpointIdFromMessage, parseCheckpointInfo, parseUserPrompts, type LinkedCommit, type ProvenanceInput } from "./parse";

const run = promisify(execFile);

/** Runs git in the given folder. Returns null instead of throwing (not a repo, missing object, ...). */
async function git(folder: string, args: string[]): Promise<string | null> {
  try {
    // Transcripts can be several megabytes, hence the large buffer.
    const { stdout } = await run("git", ["-C", folder, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

export async function readLocalCheckpoints(folder: string): Promise<ProvenanceInput> {
  const empty: ProvenanceInput = { checkpoints: [], commits: [], promptsBySession: {} };

  const refs = (await git(folder, ["for-each-ref", "--format=%(refname)", "refs/entire/checkpoints/"]))?.split("\n").filter(Boolean) ?? [];
  if (refs.length === 0) return empty;

  const checkpoints = [];
  const refById = new Map<string, string>();
  for (const ref of refs) {
    const id = ref.split("/").pop() ?? "";
    const info = parseCheckpointInfo(id, await git(folder, ["show", `${ref}:metadata.json`]), await git(folder, ["show", `${ref}:0/metadata.json`]));
    if (!info) continue;
    checkpoints.push(info);
    refById.set(id, ref);
  }

  // Every commit on every branch, with its full message, to find the "Entire-Checkpoint" trailers.
  // %x1f and %x1e are separator characters that cannot appear in a commit message.
  const log = (await git(folder, ["log", "--all", "--format=%H%x1f%B%x1e"])) ?? "";
  const commits: LinkedCommit[] = [];
  for (const record of log.split("\x1e")) {
    const [sha, message] = record.trim().split("\x1f");
    const checkpointId = message ? checkpointIdFromMessage(message) : null;
    if (!sha || !checkpointId) continue;
    const files = (await git(folder, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha]))?.split("\n").filter(Boolean) ?? [];
    commits.push({ sha, checkpointId, files });
  }

  // Each checkpoint's transcript holds the whole session so far, so the newest checkpoint of a
  // session has every prompt. Read only that one per session.
  const promptsBySession: ProvenanceInput["promptsBySession"] = {};
  const newestFirst = [...checkpoints].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const checkpoint of newestFirst) {
    if (promptsBySession[checkpoint.sessionId]) continue;
    const transcript = await git(folder, ["show", `${refById.get(checkpoint.id)}:0/transcript.jsonl`]);
    promptsBySession[checkpoint.sessionId] = transcript ? parseUserPrompts(transcript) : [];
  }

  return { checkpoints, commits, promptsBySession };
}
