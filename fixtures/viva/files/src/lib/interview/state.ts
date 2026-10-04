/**
 * The interview state machine. Pure functions only: no model calls, no I/O.
 * Given the state, these decide what happens next. Gemma decides what to say; this code decides the flow.
 */
import type { Evaluation, Hook, InterviewState, ProjectBrief, ProvenanceEntry, Question, Round, Settings, WeakSpot } from "./schemas";
import { SettingsSchema } from "./schemas";

/**
 * Decides the round of every main question up front.
 * Always one overview question first and one wrap-up last; the middle is split between
 * decisions, deep dive (the largest share) and failure/scale.
 * Example for 8: overview, decisions x2, deep-dive x3, failure-scale, wrap-up.
 */
export function planRounds(mainQuestions: number): Round[] {
  const middle = mainQuestions - 2;
  const decisions = Math.max(1, Math.floor(middle / 3));
  const failure = Math.max(1, Math.floor(middle / 4));
  const deepDive = middle - decisions - failure;
  return [
    "overview",
    ...Array<Round>(decisions).fill("decisions"),
    ...Array<Round>(deepDive).fill("deep-dive"),
    ...Array<Round>(failure).fill("failure-scale"),
    "wrap-up",
  ];
}

/** How many of last session's weak spots are retested at the start of a new session. */
export const MAX_RETESTS = 2;

export function retestCount(previousWeakSpots: WeakSpot[]): number {
  return Math.min(MAX_RETESTS, previousWeakSpots.length);
}

/** The weak-spot topic the next retest question should revisit: the first one not retested yet. */
export function nextRetestTopic(state: InterviewState): string | undefined {
  const done = state.questions.filter((question) => question.round === "retest" && !question.isFollowUp).length;
  return state.previousWeakSpots[done]?.topic;
}

export function createInterviewState(input: {
  repoId: string;
  repoLabel: string;
  filePaths: string[];
  brief: ProjectBrief;
  provenance?: ProvenanceEntry[];
  userCorrection?: string;
  previousWeakSpots?: WeakSpot[];
  settings?: Partial<Settings>;
}): InterviewState {
  const settings = SettingsSchema.parse(input.settings ?? {});
  return {
    repoId: input.repoId,
    repoLabel: input.repoLabel,
    filePaths: input.filePaths,
    brief: input.brief,
    provenance: input.provenance ?? [],
    userCorrection: input.userCorrection,
    previousWeakSpots: input.previousWeakSpots ?? [],
    settings,
    // A returning candidate first gets up to two retest questions, on top of the normal plan.
    roundPlan: [...Array<Round>(retestCount(input.previousWeakSpots ?? [])).fill("retest"), ...planRounds(settings.mainQuestions)],
    questions: [],
    answers: [],
    evaluations: [],
    delivery: [],
    endedEarly: false,
  };
}

export function mainQuestionCount(state: InterviewState): number {
  return state.questions.filter((question) => !question.isFollowUp).length;
}

/** The question waiting for an answer, if any. */
export function pendingQuestion(state: InterviewState): Question | undefined {
  const last = state.questions[state.questions.length - 1];
  if (!last) return undefined;
  return state.answers.some((answer) => answer.questionId === last.id) ? undefined : last;
}

/** A follow-up belongs to the main question it grew from, even a follow-up of a follow-up. */
export function mainQuestionOf(state: InterviewState, question: Question): Question {
  let current = question;
  while (current.isFollowUp && current.parentId) {
    const parent = state.questions.find((q) => q.id === current.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function followUpCount(state: InterviewState, mainQuestionId: string): number {
  return state.questions.filter((q) => q.isFollowUp && mainQuestionOf(state, q).id === mainQuestionId).length;
}

/** May the answer to this question get a follow-up? The limit is per main question. */
export function followUpAllowed(state: InterviewState, question: Question): boolean {
  const main = mainQuestionOf(state, question);
  return followUpCount(state, main.id) < state.settings.maxFollowUps;
}

/**
 * The follow-up rule. The model proposes; this code decides:
 * no follow-up on a skipped answer, on a failed evaluation, on an excellent answer, or past the limit.
 */
export function shouldFollowUp(state: InterviewState, question: Question, evaluation: Evaluation): boolean {
  if (evaluation.skipped || !evaluation.evaluated) return false;
  if (evaluation.score >= 4) return false;
  if (!evaluation.followUp.ask) return false;
  return followUpAllowed(state, question);
}

export type NextStep = { kind: "ask-main"; round: Round; index: number } | { kind: "done" };

/** What comes next when no follow-up is being asked: the next main question, or the end. */
export function nextMainStep(state: InterviewState): NextStep {
  const asked = mainQuestionCount(state);
  if (state.endedEarly || asked >= state.roundPlan.length) return { kind: "done" };
  return { kind: "ask-main", round: state.roundPlan[asked], index: asked };
}

export function isFinished(state: InterviewState): boolean {
  return !pendingQuestion(state) && nextMainStep(state).kind === "done";
}

/** Which kinds of hook suit which round. Overview and wrap-up are asked without a hook. */
const HOOK_KINDS_BY_ROUND: Record<Round, Hook["kind"][]> = {
  retest: [],
  overview: [],
  decisions: ["decision"],
  "deep-dive": ["ai-authored", "function", "file"],
  "failure-scale": ["risk"],
  "wrap-up": [],
};

/**
 * Picks the hook for the next main question: the first unused hook of a kind that suits the round.
 * AI-authored hooks come first in the deep dive so that at least one such question is asked.
 */
export function pickHook(state: InterviewState, round: Round): Hook | undefined {
  const used = new Set(state.questions.map((question) => question.hookId).filter(Boolean));
  for (const kind of HOOK_KINDS_BY_ROUND[round]) {
    const hook = state.brief.hooks.find((h) => h.kind === kind && !used.has(h.id));
    if (hook) return hook;
  }
  return undefined;
}

/** Ids look like "q3" for main questions and "q3.1" for their follow-ups. */
export function nextQuestionId(state: InterviewState, parent?: Question): string {
  if (!parent) return `q${mainQuestionCount(state) + 1}`;
  const main = mainQuestionOf(state, parent);
  return `${main.id}.${followUpCount(state, main.id) + 1}`;
}

export function progress(state: InterviewState): { asked: number; total: number; round: Round | null } {
  const asked = mainQuestionCount(state);
  const last = state.questions[state.questions.length - 1];
  return { asked, total: state.roundPlan.length, round: last ? mainQuestionOf(state, last).round : null };
}
