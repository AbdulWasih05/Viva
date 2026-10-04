"use client";

/** Screen 3: the interview itself, as a chat. */
import { useEffect, useRef, useState } from "react";
import type { InterviewState, Question } from "@/lib/interview/schemas";
import { mainQuestionCount } from "@/lib/interview/state";
import { Badge, Button, ErrorNote } from "./ui";

const ROUND_LABELS: Record<Question["round"], string> = {
  retest: "Retest from last session",
  overview: "Overview",
  decisions: "Decisions",
  "deep-dive": "Deep dive",
  "failure-scale": "Failure and scale",
  "wrap-up": "Wrap-up",
};

export function InterviewScreen(props: {
  state: InterviewState;
  /** What the agent did before each question (questionId -> lines such as "reading src/auth.ts"). */
  activity: Record<string, string[]>;
  busy: boolean;
  /** The answer that was just sent and is being scored ("" for a skip). */
  pendingAnswer?: string;
  error: string | null;
  onAnswer: (answer: string) => void;
  onEnd: () => void;
  onRetry: () => void;
}) {
  const { state } = props;
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const current = state.questions[state.questions.length - 1];
  const waitingForAnswer = current !== undefined && !state.answers.some((answer) => answer.questionId === current.id);
  const asked = mainQuestionCount(state);

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.questions.length, state.answers.length, props.busy]);

  const submit = (text: string) => {
    if (props.busy) return;
    setDraft("");
    props.onAnswer(text);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{state.repoLabel}</h1>
          {current ? <Badge tone="green">{ROUND_LABELS[current.round]}</Badge> : null}
          <Badge>
            Question {asked} of {state.roundPlan.length}
          </Badge>
          <Badge>{state.settings.persona === "tough" ? "Tough tech lead" : "Friendly HR round"}</Badge>
        </div>
        <Button variant="ghost" disabled={props.busy} onClick={props.onEnd}>
          End early
        </Button>
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${(asked / state.roundPlan.length) * 100}%` }} />
      </div>

      <div className="space-y-4">
        {state.questions.map((question) => {
          const answer = state.answers.find((a) => a.questionId === question.id);
          const evaluation = state.evaluations.find((e) => e.questionId === question.id);
          const lines = props.activity[question.id] ?? [];
          return (
            <div key={question.id} className="space-y-3">
              <div className="max-w-3xl rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span>Interviewer</span>
                  {question.isFollowUp ? <Badge>follow-up</Badge> : null}
                  {question.aboutAiCode ? <Badge tone="violet">AI-written code</Badge> : null}
                  {question.retestTopic ? <Badge tone="amber">retest</Badge> : null}
                </div>
                <p className="text-zinc-100">{question.text}</p>
                {lines.length > 0 ? <p className="mt-2 text-xs text-zinc-500">Before asking, Viva was {lines.join(", then ")}.</p> : null}
              </div>
              {answer ? (
                <div className="ml-auto max-w-3xl rounded-lg border border-emerald-900 bg-emerald-950/40 p-4">
                  <div className="mb-1.5 flex items-center gap-2 text-xs text-zinc-400">
                    <span>You</span>
                    {evaluation ? <Badge tone={evaluation.score >= 3 ? "green" : "amber"}>{answer.skipped ? "skipped" : `${evaluation.score}/4`}</Badge> : null}
                  </div>
                  <p className="whitespace-pre-wrap text-zinc-100">{answer.skipped ? "(skipped)" : answer.text}</p>
                </div>
              ) : null}
            </div>
          );
        })}
        {/* The answer is shown straight away, before the server has scored it. */}
        {props.busy && waitingForAnswer && props.pendingAnswer !== undefined ? (
          <div className="ml-auto max-w-3xl rounded-lg border border-emerald-900 bg-emerald-950/40 p-4">
            <div className="mb-1.5 text-xs text-zinc-400">You</div>
            <p className="whitespace-pre-wrap text-zinc-100">{props.pendingAnswer === "" ? "(skipped)" : props.pendingAnswer}</p>
          </div>
        ) : null}
        {props.busy ? (
          <p className="text-sm text-zinc-400">
            {current ? "Viva is reading your answer and preparing the next question. This can take up to a minute on the free model tier..." : "Preparing the first question..."}
          </p>
        ) : null}
        <div ref={bottom} />
      </div>

      {props.error ? <ErrorNote message={props.error} onRetry={props.onRetry} /> : null}

      {waitingForAnswer && !props.busy ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) submit(draft.trim());
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl+Enter (or Cmd+Enter) sends the answer.
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && draft.trim()) submit(draft.trim());
            }}
            rows={5}
            maxLength={6000}
            disabled={props.busy}
            placeholder="Type your answer. Ctrl+Enter to send."
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={props.busy || draft.trim() === ""}>
              Send answer
            </Button>
            <Button type="button" variant="ghost" disabled={props.busy} onClick={() => submit("")}>
              Skip / I don&apos;t know
            </Button>
            <Button type="button" variant="ghost" disabled title="Voice answers arrive with the ElevenLabs phase">
              Mic (later phase)
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
