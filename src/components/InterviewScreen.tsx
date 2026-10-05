"use client";

/** Screen 3: the interview. The current question is the focus; earlier ones sit above as a quieter transcript. */
import { useEffect, useRef, useState } from "react";
import type { InterviewState, Question } from "@/lib/interview/schemas";
import { mainQuestionCount } from "@/lib/interview/state";
import { Badge, Button, ErrorNote, inputClass } from "./ui";

const ROUND_LABELS: Record<Question["round"], string> = {
  retest: "Retest from last session",
  overview: "Overview",
  decisions: "Design decisions",
  "deep-dive": "Deep dive",
  "failure-scale": "Failure and scale",
  "wrap-up": "Wrap-up",
};

/**
 * Questions about AI-written code and retest questions start with a sentence written by code
 * ("Your Entire session shows ...", "Last time you struggled with ..."). This splits that
 * sentence off so it can be shown as a note above the question itself.
 */
function splitIntro(text: string): { intro: string | null; body: string } {
  const match =
    text.match(/^(Your Entire session shows an AI agent wrote [\s\S]*?\(the prompt was: "[\s\S]*?"\)\.)\s+([\s\S]+)$/) ??
    text.match(/^(Last time you struggled with "[\s\S]*?"\. Let's start there\.)\s+([\s\S]+)$/) ??
    text.match(/^(You also struggled with "[\s\S]*?" last time\.)\s+([\s\S]+)$/);
  return match ? { intro: match[1], body: match[2] } : { intro: null, body: text };
}

function QuestionTags({ question }: { question: Question }) {
  return (
    <>
      {question.isFollowUp ? <Badge>Follow-up</Badge> : null}
      {question.aboutAiCode ? <Badge tone="ai">AI-written code</Badge> : null}
      {question.retestTopic ? <Badge tone="warn">Retest</Badge> : null}
    </>
  );
}

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
  // Everything except the question currently being answered is history.
  const history = waitingForAnswer ? state.questions.slice(0, -1) : state.questions;

  // Keep the newest message in view.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.questions.length, state.answers.length, props.busy]);

  const submit = (text: string) => {
    if (props.busy) return;
    setDraft("");
    props.onAnswer(text);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-900">{state.repoLabel}</span> · {state.settings.persona === "tough" ? "Tough tech lead" : "Friendly HR round"}
          </div>
          <Button variant="quiet" disabled={props.busy} onClick={props.onEnd}>
            End and see report
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-zinc-900 transition-all duration-500" style={{ width: `${(asked / state.roundPlan.length) * 100}%` }} />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-zinc-500">
            {asked} of {state.roundPlan.length}
          </span>
        </div>
      </header>

      {history.length > 0 ? (
        <ol className="space-y-6 border-l border-zinc-200 pl-5">
          {history.map((question) => {
            const answer = state.answers.find((a) => a.questionId === question.id);
            const evaluation = state.evaluations.find((e) => e.questionId === question.id);
            return (
              <li key={question.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{ROUND_LABELS[question.round]}</span>
                  <QuestionTags question={question} />
                </div>
                <p className="text-sm text-zinc-600">{question.text}</p>
                {answer ? (
                  <div className="flex items-start gap-3">
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-zinc-900">{answer.skipped ? <span className="text-zinc-400">Skipped</span> : answer.text}</p>
                    {evaluation ? <Badge tone={answer.skipped ? "neutral" : evaluation.score >= 3 ? "good" : "warn"}>{answer.skipped ? "0/4" : `${evaluation.score}/4`}</Badge> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {waitingForAnswer && current ? (
        <article className="space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{ROUND_LABELS[current.round]}</Badge>
            <QuestionTags question={current} />
          </div>
          {(() => {
            const { intro, body } = splitIntro(current.text);
            return (
              <>
                {intro ? (
                  <p className={`rounded-lg border-l-2 px-4 py-3 text-sm ${current.aboutAiCode ? "border-violet-400 bg-violet-50 text-violet-900" : "border-amber-400 bg-amber-50 text-amber-900"}`}>
                    {intro}
                  </p>
                ) : null}
                <p className="font-display text-2xl leading-snug text-zinc-900">{body}</p>
              </>
            );
          })()}
          {(props.activity[current.id] ?? []).length > 0 ? (
            <p className="text-xs text-zinc-500">Before asking, the interviewer was {(props.activity[current.id] ?? []).join(", then ")}.</p>
          ) : null}
        </article>
      ) : null}

      {/* The answer is shown straight away, before the server has scored it. */}
      {props.busy && waitingForAnswer && props.pendingAnswer !== undefined ? (
        <p className="whitespace-pre-wrap rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-900">{props.pendingAnswer === "" ? <span className="text-zinc-400">Skipped</span> : props.pendingAnswer}</p>
      ) : null}

      {props.busy ? (
        <p className="flex items-center gap-2 text-sm text-zinc-500" aria-live="polite">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
          {current ? "Reading your answer and preparing the next question. On the free model tier this can take up to a minute." : "Preparing the first question..."}
        </p>
      ) : null}

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
            rows={6}
            maxLength={6000}
            autoFocus
            placeholder="Answer as you would out loud. Be specific: name the file, the reason, the trade-off."
            className={`${inputClass} text-base leading-relaxed`}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <Button type="submit" disabled={draft.trim() === ""}>
                Send answer
              </Button>
              <Button type="button" variant="secondary" onClick={() => submit("")}>
                Skip, I don&apos;t know
              </Button>
            </div>
            <span className="text-xs text-zinc-400">Ctrl + Enter to send</span>
          </div>
        </form>
      ) : null}

      <div ref={bottom} />
    </div>
  );
}
