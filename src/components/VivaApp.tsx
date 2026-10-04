"use client";

/**
 * The whole app as one client component with four steps: start -> brief -> interview -> report.
 * The interview state lives here in the browser and is sent to the server with every turn,
 * so the server keeps nothing between requests.
 */
import { useState } from "react";
import { api, type IngestResult, type ReportResult } from "@/lib/client/api";
import type { InterviewState } from "@/lib/interview/schemas";
import { createInterviewState } from "@/lib/interview/state";
import { BriefScreen } from "./BriefScreen";
import { InterviewScreen } from "./InterviewScreen";
import { ReportScreen } from "./ReportScreen";
import { StartScreen, type Sample, type StartChoice } from "./StartScreen";
import { Badge } from "./ui";

type Step = "start" | "brief" | "interview" | "report";

export function VivaApp(props: { localMode: boolean; modelLabel: string; samples: Sample[] }) {
  const [step, setStep] = useState<Step>("start");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [choice, setChoice] = useState<StartChoice | null>(null);
  const [ingest, setIngest] = useState<IngestResult | null>(null);
  const [state, setState] = useState<InterviewState | null>(null);
  const [activity, setActivity] = useState<Record<string, string[]>>({});
  const [report, setReport] = useState<ReportResult | null>(null);
  // Remembered so "Try again" can repeat exactly the step that failed.
  const [lastAnswer, setLastAnswer] = useState<string | undefined>(undefined);

  /** Runs one server call with the shared busy and error handling. */
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const readProject = (next: StartChoice, correction?: string) =>
    run(async () => {
      setChoice(next);
      setIngest(await api.ingest(next.target, correction));
      setStep("brief");
    });

  /** Writes the report again after a failed attempt. */
  const retryReport = (finalState: InterviewState) =>
    run(async () => {
      setReport(await api.report(finalState));
    });

  /** Sends an answer (or nothing, on the first turn) and stores what comes back. */
  const takeTurn = (current: InterviewState, answer?: string) =>
    run(async () => {
      setLastAnswer(answer);
      const turn = await api.turn(current, answer);
      setState(turn.state);
      if (turn.nextQuestion) setActivity((previous) => ({ ...previous, [turn.nextQuestion!.id]: turn.toolActivity }));
      if (turn.done) {
        setStep("report");
        setReport(await api.report(turn.state));
      }
    });

  /** "End early": stop asking, then write the report for what was answered. */
  const endInterview = (current: InterviewState) =>
    run(async () => {
      const ended = await api.end(current);
      setState(ended.state);
      setStep("report");
      setReport(await api.report(ended.state));
    });

  const begin = () => {
    if (!ingest || !choice) return;
    const fresh = createInterviewState({
      repoId: ingest.repoId,
      repoLabel: ingest.repoLabel,
      filePaths: ingest.filePaths,
      brief: ingest.brief,
      provenance: ingest.provenance,
      previousWeakSpots: ingest.previousWeakSpots,
      settings: choice.settings,
    });
    setState(fresh);
    setActivity({});
    setReport(null);
    setStep("interview");
    void takeTurn(fresh);
  };

  const restart = () => {
    setStep("start");
    setIngest(null);
    setState(null);
    setReport(null);
    setError(null);
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-5 py-8">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={props.localMode ? "green" : "neutral"}>{props.localMode ? "Local mode: private, with memory" : "Hosted demo: nothing is stored"}</Badge>
        <Badge>{props.modelLabel}</Badge>
      </div>

      {step === "start" ? <StartScreen localMode={props.localMode} samples={props.samples} busy={busy} error={error} onStart={readProject} /> : null}

      {step === "brief" && ingest && choice ? (
        <BriefScreen
          ingest={ingest}
          busy={busy}
          error={error}
          onCorrect={(correction) => readProject(choice, correction)}
          onBegin={begin}
          onBack={restart}
          onForget={() =>
            run(async () => {
              await api.forget(ingest.repoId);
              setIngest({ ...ingest, previousWeakSpots: [] });
            })
          }
        />
      ) : null}

      {step === "interview" && state ? (
        <InterviewScreen
          state={state}
          activity={activity}
          busy={busy}
          pendingAnswer={lastAnswer}
          error={error}
          onAnswer={(answer) => takeTurn(state, answer)}
          onEnd={() => endInterview(state)}
          onRetry={() => takeTurn(state, lastAnswer)}
        />
      ) : null}

      {step === "report" ? (
        report && state && ingest ? (
          <ReportScreen repoLabel={state.repoLabel} result={report} memoryLabel={ingest.memory.label} onRestart={restart} />
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-200">{error}</p>
            <button className="text-sm underline underline-offset-2" onClick={() => state && retryReport(state)}>
              Try again
            </button>
          </div>
        ) : (
          <p className="text-zinc-400">Writing your report...</p>
        )
      ) : null}
    </main>
  );
}
