/** Builds what one interview turn needs (see TurnDeps) with the Mastra interviewer agent plugged in. */
import type { RepoSource } from "../lib/ingest/types";
import type { ProvenanceEntry, Settings } from "../lib/interview/schemas";
import type { TurnDeps } from "../lib/interview/turn";
import { createRepoContext } from "./context";
import { interviewerGenerate } from "./generate";

export function createAgentDeps(source: RepoSource, settings: Pick<Settings, "persona" | "targetRole">, provenance: ProvenanceEntry[] = []): TurnDeps {
  const repo = createRepoContext({ filePaths: source.files.map((file) => file.path), readFile: source.readFile, provenance });
  return {
    readFile: source.readFile,
    agent: {
      generate: interviewerGenerate({ repo, persona: settings.persona, targetRole: settings.targetRole }),
      // splice(0) empties the list and returns what was in it, so each question reports only its own activity.
      takeFilesRead: () => repo.filesRead.splice(0),
      takeActivity: () => repo.activity.splice(0),
    },
  };
}
