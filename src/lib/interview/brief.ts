/** Project brief: Gemma reads the selected files and writes a brief; our code then checks every path in it. */
import { loadContents, selectFiles } from "../ingest/select";
import type { RepoSource, SelectedFile } from "../ingest/types";
import { getProvider } from "../llm/provider";
import { generateStructured, type GenerateFn, type StructuredMeta } from "../llm/structured";
import { BRIEF_INSTRUCTIONS, MAX_PATHS_IN_PROMPT, briefPrompt } from "./prompts";
import { BriefDraftSchema, type BriefDraft, type ProjectBrief } from "./schemas";

/** Time limit for the two long calls (brief and report) on the hosted model. Local mode keeps its own, longer limit. */
export const LONG_CALL_TIMEOUT_MS = getProvider() === "hosted" ? 60_000 : undefined;

/** The model sometimes writes "./src/a.ts" or "src\\a.ts" for a real "src/a.ts". Treat those as the same path. */
export function normalizePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\//, "");
}

/**
 * Checks every file path in the model's draft against the real file list.
 * Invented paths are removed and counted; the count becomes a quality metric.
 *
 * - A component keeps only its real files.
 * - A "file" or "function" hook with an invented path is dropped (it has nothing real to point at).
 * - A "decision" or "risk" hook with an invented path keeps its text but loses the path.
 */
export function validateBrief(draft: BriefDraft, filePaths: string[]): { brief: ProjectBrief; inventedPathsDropped: number } {
  const known = new Set(filePaths);
  let dropped = 0;

  const components = draft.components.map((component) => {
    const files = component.files.map(normalizePath).filter((file) => known.has(file));
    dropped += component.files.length - files.length;
    return { ...component, files };
  });

  const hooks: ProjectBrief["hooks"] = [];
  for (const hook of draft.hooks) {
    const file = hook.file ? normalizePath(hook.file) : null;
    const isReal = file !== null && known.has(file);
    if (file !== null && !isReal) dropped += 1;

    const needsFile = hook.kind === "file" || hook.kind === "function";
    if (needsFile && !isReal) continue;
    hooks.push({ id: `h${hooks.length + 1}`, kind: hook.kind, ref: hook.ref, file: isReal ? file : null, why: hook.why });
  }

  return {
    brief: { summary: draft.summary, stack: draft.stack, components, decisions: draft.decisions, risks: draft.risks, hooks },
    inventedPathsDropped: dropped,
  };
}

/** Used when the model fails twice: a plain brief built only from facts we already have. */
export function fallbackBrief(label: string, selected: SelectedFile[]): BriefDraft {
  return {
    summary: `Viva could not analyse ${label} automatically, so this brief only lists its main files.`,
    stack: [],
    components: [],
    decisions: [],
    risks: [],
    hooks: selected
      .filter((file) => file.reason === "source file" || file.reason === "entry point")
      .slice(0, 6)
      .map((file) => ({ kind: "file" as const, ref: file.path, file: file.path, why: `One of the project's main files (${file.reason}).` })),
  };
}

export type BriefResult = {
  brief: ProjectBrief;
  filesUsed: SelectedFile[];
  inventedPathsDropped: number;
  meta: StructuredMeta;
};

export async function createBrief(source: RepoSource, options: { correction?: string; generate?: GenerateFn } = {}): Promise<BriefResult> {
  const filesUsed = selectFiles(source.files);
  const contents = await loadContents(source, filesUsed);
  const filePaths = source.files.map((file) => file.path);

  const { value, meta } = await generateStructured({
    instructions: BRIEF_INSTRUCTIONS,
    // The path list is capped so a huge repo cannot blow the prompt up.
    prompt: briefPrompt({ filePaths: filePaths.slice(0, MAX_PATHS_IN_PROMPT), contents, correction: options.correction }),
    schema: BriefDraftSchema,
    fallback: fallbackBrief(source.label, filesUsed),
    // The brief is the longest prompt and the longest answer, so it gets a longer limit than a turn.
    timeoutMs: LONG_CALL_TIMEOUT_MS,
    generate: options.generate,
  });

  const { brief, inventedPathsDropped } = validateBrief(value, filePaths);
  return { brief, filesUsed, inventedPathsDropped, meta };
}
