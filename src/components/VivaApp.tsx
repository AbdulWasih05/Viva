"use client";

/**
 * The whole app as one client component with four steps: start -> brief -> interview -> report.
 * The interview state lives here in the browser and is sent to the server with every turn,
 * so the server keeps nothing between requests.
 */
import { useEffect, useState } from "react";
import { api, type IngestResult, type ReportResult } from "@/lib/client/api";
import type { InterviewState } from "@/lib/interview/schemas";
import { createInterviewState } from "@/lib/interview/state";
import { BriefScreen } from "./BriefScreen";
import { InterviewScreen } from "./InterviewScreen";
import { ReportScreen } from "./ReportScreen";
import { StartScreen, type Sample, type StartChoice } from "./StartScreen";
import { Badge, ErrorNote } from "./ui";

type Step = "start" | "brief" | "interview" | "report";

const STEPS: { id: Step; label: string }[] = [
  { id: "start", label: "Project" },
  { id: "brief", label: "Brief" },
  { id: "interview", label: "Interview" },
  { id: "report", label: "Report" },
];

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

  // Each step is a new page of content, so start it from the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-6 py-4">
          <button onClick={restart} className="font-display text-2xl tracking-tight text-zinc-900" aria-label="Viva, back to start">
            Viva
          </button>
          {/* Where you are in the four steps. */}
          <ol className="flex items-center gap-1 text-sm">
            {STEPS.map((item, index) => {
              const position = STEPS.findIndex((s) => s.id === step);
              const status = index === position ? "current" : index < position ? "done" : "todo";
              return (
                <li key={item.id} className="flex items-center gap-1">
                  {index > 0 ? <span className="mx-1 h-px w-4 bg-zinc-300" /> : null}
                  <span
                    aria-current={status === "current" ? "step" : undefined}
                    className={status === "current" ? "font-medium text-zinc-900" : status === "done" ? "text-zinc-500" : "text-zinc-300"}
                  >
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center gap-1.5">
            <Badge tone={props.localMode ? "good" : "neutral"}>{props.localMode ? "Local: private, with memory" : "Hosted demo: nothing stored"}</Badge>
            <Badge>{props.modelLabel}</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">

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
          <ErrorNote message={error} onRetry={() => state && retryReport(state)} />
        ) : (
          <p className="flex items-center gap-2 text-zinc-500" aria-live="polite">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            Scoring your answers and writing the report...
          </p>
        )
      ) : null}
      </main>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto w-full max-w-5xl px-6 py-4 text-xs text-zinc-500">
          The interviewer is Gemma, an open-weight model. Your interview stays in this browser tab; the hosted demo stores nothing.
        </div>
      </footer>
    </div>
  );
}
