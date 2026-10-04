/**
 * Provenance entry point: given a repo, find out which files an AI agent wrote (from Entire checkpoints).
 * Never throws. A repo without checkpoints, or any read error, gives an empty result plus a short hint.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isSourceFile } from "../ingest/select";
import type { RepoSource } from "../ingest/types";
import type { Hook, ProjectBrief, ProvenanceEntry } from "../interview/schemas";
import { readGitHubCheckpoints } from "./github";
import { readLocalCheckpoints } from "./local";
import { aiWrittenAreas, buildProvenance, type ProvenanceInput } from "./parse";

export const NO_CHECKPOINTS_HINT =
  "No Entire checkpoints found in this repo, so Viva cannot tell which parts an AI agent wrote. " +
  "Record your coding sessions with Entire (entire.io) and Viva will ask about the AI-written code.";

export type ProvenanceResult = {
  provenance: ProvenanceEntry[];
  checkpointCount: number;
  /** A sentence for the UI when there is nothing to show; null when provenance was found. */
  hint: string | null;
};

export function provenanceFromInput(input: ProvenanceInput, filePaths: string[]): ProvenanceResult {
  // Only source files make interview questions; docs, configs and fixtures are left out.
  const provenance = buildProvenance(input, filePaths, isSourceFile);
  return { provenance, checkpointCount: input.checkpoints.length, hint: input.checkpoints.length === 0 ? NO_CHECKPOINTS_HINT : null };
}

export async function loadProvenance(source: RepoSource): Promise<ProvenanceResult> {
  const filePaths = source.files.map((file) => file.path);
  try {
    // A fixture carries its checkpoint data as a file (see scripts/snapshot-viva.ts).
    if (source.id.startsWith("fixture:")) {
      const saved = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "fixtures", source.id.slice("fixture:".length), "checkpoints.json");
      if (existsSync(saved)) return provenanceFromInput(JSON.parse(readFileSync(saved, "utf8")) as ProvenanceInput, filePaths);
    }
    if (source.origin?.kind === "github") return provenanceFromInput(await readGitHubCheckpoints(source.origin.owner, source.origin.repo), filePaths);
    if (source.origin?.kind === "local") return provenanceFromInput(await readLocalCheckpoints(source.origin.folder), filePaths);
  } catch {
    // Fall through to the quiet "nothing found" result.
  }
  return { provenance: [], checkpointCount: 0, hint: NO_CHECKPOINTS_HINT };
}

/** How many AI-written files become interview hooks. One deep-dive question uses one hook. */
const MAX_AI_HOOKS = 3;

/**
 * Adds "ai-authored" hooks to the brief so the interviewer asks about AI-written code.
 * Files the brief already found interesting come first; then the rest in provenance order.
 */
export function addAiHooks(brief: ProjectBrief, provenance: ProvenanceEntry[]): ProjectBrief {
  const areas = aiWrittenAreas(provenance);
  if (areas.length === 0) return brief;

  const mentioned = new Set(brief.hooks.map((hook) => hook.file).filter(Boolean));
  const ranked = [...areas.filter((area) => mentioned.has(area.path)), ...areas.filter((area) => !mentioned.has(area.path))];

  const aiHooks: Hook[] = ranked.slice(0, MAX_AI_HOOKS).map((area, index) => ({
    id: `ai${index + 1}`,
    kind: "ai-authored",
    ref: `AI-written code in ${area.path}`,
    file: area.path,
    why: `An Entire checkpoint (${area.checkpointId}, commit ${area.commit}) shows an AI agent session produced this file. The session's prompt: "${area.promptSummary}"`,
  }));
  return { ...brief, hooks: [...brief.hooks, ...aiHooks] };
}

export { aiWrittenAreas } from "./parse";
