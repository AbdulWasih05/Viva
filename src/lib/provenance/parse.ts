/**
 * Turns raw Entire checkpoint data into an "AI-authored map": which files an AI agent wrote,
 * in which commit, and from which prompt.
 *
 * Pure functions only. The readers in local.ts and github.ts fetch the raw data; everything here
 * can be tested with plain objects.
 *
 * How Entire stores a checkpoint (verified on this repo, CLI 0.11.3, DECISIONS D18 to D22):
 *   - a git ref refs/entire/checkpoints/<shard>/<id> whose tree holds metadata.json,
 *     0/metadata.json, 0/prompt.txt and 0/transcript.jsonl
 *   - the code commit made during the session carries the trailer "Entire-Checkpoint: <id>"
 */
import type { ProvenanceEntry } from "../interview/schemas";

/** What we need from one checkpoint's metadata files. */
export type CheckpointInfo = {
  id: string;
  sessionId: string;
  /** ISO time the checkpoint was written. */
  createdAt: string;
  /** Files Entire saw the agent touch. Can be incomplete (see buildProvenance). */
  filesTouched: string[];
  agentLines: number;
  agentPercentage: number;
};

/** A normal code commit that is linked to a checkpoint by its trailer. */
export type LinkedCommit = { sha: string; checkpointId: string; files: string[] };

/** Something a person typed in the agent session. */
export type UserPrompt = { ts: string; text: string };

/** Everything buildProvenance needs. This is also the shape saved in fixtures/viva/checkpoints.json. */
export type ProvenanceInput = {
  checkpoints: CheckpointInfo[];
  commits: LinkedCommit[];
  /** Human prompts per session id, oldest first. */
  promptsBySession: Record<string, UserPrompt[]>;
};

const TRAILER = /^Entire-Checkpoint:\s*([0-9A-Za-z]+)\s*$/m;

/** Reads the checkpoint id from a commit message's trailer, or null if the commit is not linked. */
export function checkpointIdFromMessage(message: string): string | null {
  return message.match(TRAILER)?.[1] ?? null;
}

/** Tolerant JSON read of metadata.json and 0/metadata.json: missing fields become empty values. */
export function parseCheckpointInfo(id: string, rootJson: string | null, sessionJson: string | null): CheckpointInfo | null {
  try {
    const root = rootJson ? (JSON.parse(rootJson) as Record<string, unknown>) : {};
    const session = sessionJson ? (JSON.parse(sessionJson) as Record<string, unknown>) : {};
    const attribution = (session.initial_attribution ?? {}) as Record<string, unknown>;
    const files = (session.files_touched ?? root.files_touched ?? []) as unknown;
    return {
      id,
      sessionId: String(session.session_id ?? ""),
      createdAt: String(session.created_at ?? ""),
      filesTouched: Array.isArray(files) ? files.map(String) : [],
      agentLines: Number(attribution.agent_lines ?? 0) || 0,
      agentPercentage: Number(attribution.agent_percentage ?? 0) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Is this transcript message something the person actually typed?
 * Sessions also record machine-made "user" messages: background task notifications,
 * system reminders, interruption markers. Our first checkpoint's prompt.txt was one of those,
 * which is why prompts are taken from the transcript and filtered here.
 */
export function cleanPrompt(raw: string): string | null {
  // A pasted block is still the person's own prompt; drop only the wrapper tags.
  const text = raw.replace(/<\/?pasted_content[^>]*>/g, "").trim();
  if (text.length < 12) return null; // "continue", "yes", empty lines
  if (text.startsWith("<")) return null; // <task-notification>, <system-reminder>, <command-name> ...
  if (text.startsWith("[Request interrupted")) return null;
  return text;
}

/** Extracts the human prompts from Entire's compact transcript (one JSON object per line). */
export function parseUserPrompts(transcriptJsonl: string): UserPrompt[] {
  const prompts: UserPrompt[] = [];
  for (const line of transcriptJsonl.split("\n")) {
    // Cheap pre-check so the (large) assistant lines are never parsed.
    if (!line.includes('"type":"user"')) continue;
    try {
      const entry = JSON.parse(line) as { type?: string; ts?: string; content?: { text?: string }[] };
      if (entry.type !== "user") continue;
      const text = cleanPrompt((entry.content ?? []).map((part) => part.text ?? "").join("\n"));
      if (text) prompts.push({ ts: entry.ts ?? "", text });
    } catch {
      // A malformed line is skipped; the rest of the transcript is still useful.
    }
  }
  return prompts;
}

/** One line, at most 160 characters, safe to quote back to the candidate. */
export function summarizePrompt(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= 160 ? oneLine : `${oneLine.slice(0, 157)}...`;
}

/**
 * The prompt that led to a checkpoint: the first thing the person typed after the previous
 * checkpoint (that is usually the task; later messages are steering). If they typed nothing
 * in that window, the most recent earlier prompt is used.
 */
export function pickPrompt(prompts: UserPrompt[], after: string, upTo: string): UserPrompt | undefined {
  const inWindow = prompts.filter((prompt) => prompt.ts > after && prompt.ts <= upTo);
  if (inWindow.length > 0) return inWindow[0];
  const earlier = prompts.filter((prompt) => prompt.ts <= upTo);
  return earlier[earlier.length - 1];
}

/**
 * Builds the AI-authored map.
 *
 * Which files count as AI-written for a linked commit:
 *   - If Entire's attribution says the agent wrote lines AND lists touched files, use those files.
 *   - Otherwise use every file changed in the commit ("commit-level"). On this repo Entire's own
 *     list was incomplete (it credited 0 agent lines to commits the agent wrote entirely), so the
 *     commit-level fallback is what usually applies.
 * Only paths that exist in the repo today and pass `isRelevant` are kept.
 */
export function buildProvenance(input: ProvenanceInput, filePaths: string[], isRelevant: (path: string) => boolean = () => true): ProvenanceEntry[] {
  const known = new Set(filePaths);
  const byId = new Map(input.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
  const entries: ProvenanceEntry[] = [];

  for (const commit of input.commits) {
    const checkpoint = byId.get(commit.checkpointId);
    if (!checkpoint) continue;

    // The window for "which prompt led to this" starts at the previous checkpoint of the same session.
    const earlier = input.checkpoints
      .filter((other) => other.sessionId === checkpoint.sessionId && other.createdAt < checkpoint.createdAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const windowStart = earlier[earlier.length - 1]?.createdAt ?? "";
    const prompt = pickPrompt(input.promptsBySession[checkpoint.sessionId] ?? [], windowStart, checkpoint.createdAt);

    const attributed = checkpoint.agentLines > 0 && checkpoint.filesTouched.length > 0;
    const touched = new Set(checkpoint.filesTouched);
    const files = attributed ? commit.files.filter((file) => touched.has(file)) : commit.files;

    for (const path of files) {
      if (!known.has(path) || !isRelevant(path)) continue;
      entries.push({
        path,
        commit: commit.sha.slice(0, 7),
        checkpointId: checkpoint.id,
        promptSummary: prompt ? summarizePrompt(prompt.text) : "(the session's prompt could not be read)",
        scope: "file",
        source: attributed ? "attribution" : "commit",
      });
    }
  }
  return entries;
}

export type AiWrittenArea = { path: string; commit: string; checkpointId: string; promptSummary: string; source: "attribution" | "commit" };

/** One line per file for the "AI-written areas" panel. The first entry for a path wins (commits arrive newest first). */
export function aiWrittenAreas(provenance: ProvenanceEntry[]): AiWrittenArea[] {
  const seen = new Set<string>();
  const areas: AiWrittenArea[] = [];
  for (const entry of provenance) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    areas.push({ path: entry.path, commit: entry.commit, checkpointId: entry.checkpointId, promptSummary: entry.promptSummary, source: entry.source ?? "commit" });
  }
  return areas;
}
