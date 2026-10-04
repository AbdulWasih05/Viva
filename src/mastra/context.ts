/**
 * What the interviewer agent's tools need to know about the current request.
 *
 * The agent and its tools are created once. The repo being discussed changes per request,
 * so it travels in Mastra's RequestContext and the tools read it from there.
 */
import { RequestContext } from "@mastra/core/request-context";
import type { Persona, ProvenanceEntry } from "../lib/interview/schemas";

export type RepoContext = {
  /** Every real file path in the candidate's repo. Tools refuse anything else. */
  filePaths: string[];
  readFile: (path: string) => Promise<string>;
  provenance: ProvenanceEntry[];
  /** Files the agent opened during this call, in order. Filled in by the readFile tool. */
  filesRead: string[];
  /** Human-readable lines for the UI's status text ("reading src/auth.ts"). */
  activity: string[];
  /** Tool calls made for the current question. The tools refuse once the limit is reached. */
  toolCalls: number;
};

export type VivaContext = {
  repo: RepoContext;
  persona: Persona;
  targetRole: string;
};

export function createRepoContext(input: Pick<RepoContext, "filePaths" | "readFile"> & { provenance?: ProvenanceEntry[] }): RepoContext {
  return { filePaths: input.filePaths, readFile: input.readFile, provenance: input.provenance ?? [], filesRead: [], activity: [], toolCalls: 0 };
}

export function createRequestContext(values: VivaContext): RequestContext<VivaContext> {
  const context = new RequestContext<VivaContext>();
  context.set("repo", values.repo);
  context.set("persona", values.persona);
  context.set("targetRole", values.targetRole);
  return context;
}
