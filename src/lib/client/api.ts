/** Browser-side helpers for calling Viva's API routes. Types mirror what the routes return. */
import type { AiWrittenArea } from "../provenance/parse";
import type { Evaluation, InterviewState, ProjectBrief, ProvenanceEntry, Question, Report, WeakSpot } from "../interview/schemas";

export type IngestResult = {
  repoId: string;
  repoLabel: string;
  filePaths: string[];
  brief: ProjectBrief;
  provenance: ProvenanceEntry[];
  aiAreas: AiWrittenArea[];
  checkpointCount: number;
  provenanceHint: string | null;
  filesUsed: string[];
  inventedPathsDropped: number;
  usedFallback: boolean;
  cached: boolean;
  previousWeakSpots: WeakSpot[];
  memory: { enabled: boolean; label: string };
};

export type TurnResult = {
  state: InterviewState;
  evaluation?: Evaluation;
  nextQuestion?: Question;
  done: boolean;
  toolActivity: string[];
};

export type ReportResult = { report: Report; markdown: string; savedToMemory: boolean; usedFallback: boolean };

/** Sends JSON and returns JSON. On any failure it throws an Error whose message is safe to show the user. */
async function send<T>(path: string, body: unknown, method: "POST" | "DELETE" = "POST"): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Could not reach Viva. Is the server still running?");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) {
    if (res.status === 429) throw new Error(data?.error ?? "Too many requests. Please wait a minute and try again.");
    throw new Error(data?.error ?? "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  ingest: (target: string, correction?: string) => send<IngestResult>("/api/ingest", { target, correction }),
  turn: (state: InterviewState, answer?: string) => send<TurnResult>("/api/turn", { state, answer }),
  end: (state: InterviewState) => send<TurnResult>("/api/turn", { state, action: "end" }),
  report: (state: InterviewState) => send<ReportResult>("/api/report", { state }),
  forget: (repoId: string) => send<{ forgotten: boolean }>("/api/memory", { repoId }, "DELETE"),
};
