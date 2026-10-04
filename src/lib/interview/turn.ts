/**
 * One interview turn: evaluate the last answer, then decide and produce what comes next.
 *
 * The model writes questions and evaluations; the state machine in state.ts decides the flow.
 * In Phase 2 a Mastra agent with tools takes over the question writing; the flow stays the same.
 */
import { PER_FILE_CAP_CHARS } from "../ingest/select";
import type { FileContent } from "../ingest/types";
import { generateStructured, type GenerateFn, type StructuredMeta } from "../llm/structured";
import { normalizePath } from "./brief";
import { evaluationPrompt, interviewerInstructions, questionPrompt } from "./prompts";
import {
  EvaluationDraftSchema,
  QuestionDraftSchema,
  type Evaluation,
  type InterviewState,
  type Question,
  type QuestionDraft,
  type Round,
} from "./schemas";
import { followUpAllowed, isFinished, nextMainStep, nextQuestionId, nextRetestTopic, pendingQuestion, pickHook, shouldFollowUp } from "./state";

/** What a turn needs from the outside world. Tests pass fakes for both. */
export type TurnDeps = {
  /** Reads a file from the candidate's repo. Only ever called with a validated path. */
  readFile: (path: string) => Promise<string>;
  generate?: GenerateFn;
  /**
   * The Mastra interviewer agent (Phase 2). When present it writes the code-related questions
   * and opens files itself with its readFile tool, instead of being handed a file up front.
   */
  agent?: {
    generate: GenerateFn;
    /** Files the agent opened since the last call to this function. */
    takeFilesRead: () => string[];
    /** Status lines ("reading src/auth.ts") since the last call to this function. */
    takeActivity: () => string[];
  };
};

/** Rounds where looking at code helps. Overview, retest and wrap-up are asked without tools: faster and cheaper. */
const AGENT_ROUNDS: Round[] = ["decisions", "deep-dive", "failure-scale"];

/** Per-turn quality facts. These become Sentry span attributes in Phase 7 and eval metrics now. */
export type TurnQuality = {
  /** The model named a file that does not exist; it was removed before the user saw it. */
  inventedPathDropped: boolean;
  /** A deep-dive question that names a real file. null when the question is not a deep dive. */
  questionNamesRealFile: boolean | null;
  /** A follow-up whose quoted phrase really appears in the candidate's answer. null when there is no follow-up. */
  followUpReferencesAnswer: boolean | null;
  /** A main question about code that an AI agent wrote, saying so and naming the session's prompt. */
  aiAuthoredQuestion: boolean;
  jsonRepairUsed: boolean;
  fallbackUsed: boolean;
};

/** Safe questions for when the model fails twice. One per round, generic but always valid. */
const FALLBACK_QUESTIONS: Record<Round, string> = {
  retest: "Explain this topic again in your own words, with one concrete example from your project.",
  overview: "Walk me through your project: what does it do, and how is it put together?",
  decisions: "Pick one technical decision you made in this project. Why did you choose it, and what was the alternative?",
  "deep-dive": "Pick the most complex part of your code and explain how it works, step by step.",
  "failure-scale": "What is the first thing that would break if this project had 100 times more users, and how would you fix it?",
  "wrap-up": "If you had one more month on this project, what would you change or build next, and why?",
};

function fallbackQuestion(round: Round): QuestionDraft {
  return { text: FALLBACK_QUESTIONS[round], file: null, rubric: { mustMention: [], goodSignals: [], redFlags: [] } };
}

/** Lower-case and collapse whitespace so a quote still matches if spacing or case differs. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The cheap grounding check: is the phrase the model says it is following up on really in the answer? */
export function quoteAppearsInAnswer(quote: string | null, answer: string): boolean {
  if (!quote) return false;
  const cleaned = normalizeText(quote).replace(/^["'“”]+|["'“”.]+$/g, "");
  return cleaned.length >= 8 && normalizeText(answer).includes(cleaned);
}

async function readForPrompt(deps: TurnDeps, path: string): Promise<FileContent | undefined> {
  try {
    const text = await deps.readFile(path);
    return { path, content: text.slice(0, PER_FILE_CAP_CHARS), truncated: text.length > PER_FILE_CAP_CHARS };
  } catch {
    return undefined;
  }
}

/** Writes the next main question for the given round. */
export async function askMainQuestion(
  state: InterviewState,
  round: Round,
  deps: TurnDeps,
): Promise<{ question: Question; meta: StructuredMeta; quality: TurnQuality; activity: string[] }> {
  const hook = pickHook(state, round);
  const agent = deps.agent && AGENT_ROUNDS.includes(round) ? deps.agent : undefined;
  // Without the agent, the hook's file is pasted into the prompt. With it, the agent opens files itself.
  let file = !agent && hook?.file ? await readForPrompt(deps, hook.file) : undefined;
  const retestTopic = round === "retest" ? nextRetestTopic(state) : undefined;
  const retestNumber = state.questions.filter((q) => q.round === "retest" && !q.isFollowUp).length;

  const instructions = interviewerInstructions(state.settings.persona, state.settings.targetRole);
  let result = await generateStructured({
    label: agent ? "question (agent)" : "question",
    instructions,
    prompt: questionPrompt({ state, round, hook, file, retestTopic, toolsAvailable: Boolean(agent) }),
    schema: QuestionDraftSchema,
    fallback: fallbackQuestion(round),
    generate: agent ? agent.generate : deps.generate,
    // The agent gets one attempt. Retrying it means repeating its tool calls, which is slow and
    // expensive; the plain call below is the cheaper plan B.
    maxAttempts: agent ? 1 : 2,
  });
  let agentFiles = agent ? agent.takeFilesRead() : [];
  let activity = agent ? agent.takeActivity() : file ? [`reading ${file.path}`] : [];

  // Plan B: the agent did not produce a usable question (for example it spent its steps re-reading
  // a large file). Ask again the plain way, with the hook's file pasted into the prompt.
  if (agent && result.meta.usedFallback) {
    file = hook?.file ? await readForPrompt(deps, hook.file) : undefined;
    const agentMs = result.meta.ms;
    result = await generateStructured({
      label: "question (plan B)",
      instructions,
      prompt: questionPrompt({ state, round, hook, file, retestTopic, toolsAvailable: false }),
      schema: QuestionDraftSchema,
      fallback: fallbackQuestion(round),
      generate: deps.generate,
    });
    result.meta.ms += agentMs;
    result.meta.repaired = true;
    agentFiles = [];
    activity = file ? [`reading ${file.path}`] : [];
  }
  const { value: draft, meta } = result;

  // The "last time" sentence is written by code, so a returning session always opens with it.
  const retestIntro = !retestTopic
    ? ""
    : retestNumber === 0
      ? `Last time you struggled with "${retestTopic}". Let's start there. `
      : `You also struggled with "${retestTopic}" last time. `;

  // For AI-written code the "your session shows ..." sentence is written by code, with the prompt
  // taken from the Entire checkpoint, so the question always says where it comes from.
  const origin = hook?.kind === "ai-authored" ? state.provenance.find((entry) => entry.path === hook.file) : undefined;
  const aiIntro = origin ? `Your Entire session shows an AI agent wrote ${origin.path} (the prompt was: "${origin.promptSummary}"). ` : "";

  // Validate the path the model named before it can reach the user.
  const named = draft.file ? normalizePath(draft.file) : null;
  const namedIsReal = named !== null && state.filePaths.includes(named);

  const question: Question = {
    id: nextQuestionId(state),
    round,
    persona: state.settings.persona,
    text: retestIntro + aiIntro + draft.text,
    hookId: hook?.id,
    filesRead: [...new Set([file?.path, ...agentFiles, namedIsReal ? named : undefined].filter((p): p is string => Boolean(p)))],
    rubric: draft.rubric,
    isFollowUp: false,
    aboutAiCode: hook?.kind === "ai-authored",
    retestTopic,
  };

  return {
    question,
    meta,
    activity,
    quality: {
      inventedPathDropped: named !== null && !namedIsReal,
      questionNamesRealFile: round === "deep-dive" ? namedIsReal : null,
      followUpReferencesAnswer: null,
      aiAuthoredQuestion: Boolean(origin),
      jsonRepairUsed: meta.repaired,
      fallbackUsed: meta.usedFallback,
    },
  };
}

/** Phrases that count as "I don't know". They are scored 0 without a model call. */
const DONT_KNOW = /^(i\s*(do\s*not|don'?t)\s*know|no\s*idea|not\s*sure|idk|skip|pass)[\s.!]*$/i;

export function isSkip(answer: string): boolean {
  return answer.trim() === "" || DONT_KNOW.test(answer.trim());
}

/** Scores the answer and, if a follow-up is warranted, returns it as the next question. */
export async function evaluateAnswer(
  state: InterviewState,
  question: Question,
  answer: string,
  deps: TurnDeps,
): Promise<{ evaluation: Evaluation; followUp?: Question; meta?: StructuredMeta; quality: TurnQuality }> {
  const quality: TurnQuality = {
    inventedPathDropped: false,
    questionNamesRealFile: null,
    followUpReferencesAnswer: null,
    aiAuthoredQuestion: false,
    jsonRepairUsed: false,
    fallbackUsed: false,
  };

  // A skip is scored by code, not by the model: 0 points, and the rubric goes on the revision list.
  if (isSkip(answer)) {
    return {
      evaluation: {
        questionId: question.id,
        answerSummary: "Skipped or did not know.",
        score: 0,
        good: [],
        missing: question.rubric.mustMention,
        followUp: { ask: false, reason: "Skipped answers get no follow-up." },
        evaluated: true,
        skipped: true,
      },
      quality,
    };
  }

  const allowed = followUpAllowed(state, question);
  const { value: draft, meta } = await generateStructured({
    label: "evaluation",
    instructions: interviewerInstructions(state.settings.persona, state.settings.targetRole),
    prompt: evaluationPrompt({ state, question, answer, followUpAllowed: allowed }),
    schema: EvaluationDraftSchema,
    // A placeholder that is marked as not evaluated, so it never counts towards the score.
    fallback: {
      answerSummary: "Viva could not evaluate this answer automatically.",
      score: 0,
      good: [],
      missing: [],
      followUp: { ask: false, question: null, quote: null, reason: "Evaluation failed." },
    },
    generate: deps.generate,
  });
  quality.jsonRepairUsed = meta.repaired;
  quality.fallbackUsed = meta.usedFallback;

  const evaluation: Evaluation = {
    questionId: question.id,
    answerSummary: draft.answerSummary,
    score: draft.score,
    good: draft.good,
    missing: draft.missing,
    followUp: { ask: draft.followUp.ask && Boolean(draft.followUp.question), reason: draft.followUp.reason ?? "" },
    evaluated: !meta.usedFallback,
    skipped: false,
  };

  if (!shouldFollowUp(state, question, evaluation) || !draft.followUp.question) {
    evaluation.followUp.ask = false;
    return { evaluation, meta, quality };
  }

  quality.followUpReferencesAnswer = quoteAppearsInAnswer(draft.followUp.quote, answer);
  const followUp: Question = {
    id: nextQuestionId(state, question),
    round: question.round,
    persona: state.settings.persona,
    text: draft.followUp.question,
    hookId: question.hookId,
    filesRead: [],
    // A follow-up is judged against its parent's rubric: it digs into the same topic.
    rubric: question.rubric,
    isFollowUp: true,
    parentId: question.id,
    aboutAiCode: question.aboutAiCode,
    retestTopic: question.retestTopic,
  };
  return { evaluation, followUp, meta, quality };
}

export type TurnResult = {
  state: InterviewState;
  evaluation?: Evaluation;
  nextQuestion?: Question;
  done: boolean;
  /** Short lines describing what happened, for the "reading src/auth.ts..." status text. */
  toolActivity: string[];
  quality: TurnQuality[];
  /** One entry per model call in this turn, tagged with what the call was for. */
  metas: { kind: "question" | "evaluation"; meta: StructuredMeta }[];
};

/**
 * The whole turn, as /api/turn will call it.
 * - With no pending question (start of the interview): asks the first question.
 * - With a pending question: records and evaluates `answer`, then asks a follow-up or the next
 *   main question, or finishes.
 * The input state is not modified; a new state is returned.
 */
export async function runTurn(input: InterviewState, answer: string | undefined, deps: TurnDeps): Promise<TurnResult> {
  const state: InterviewState = structuredClone(input);
  const result: TurnResult = { state, done: false, toolActivity: [], quality: [], metas: [] };

  const pending = pendingQuestion(state);
  let followUp: Question | undefined;

  if (pending) {
    const text = answer ?? "";
    const evaluated = await evaluateAnswer(state, pending, text, deps);
    state.answers.push({ questionId: pending.id, text, skipped: evaluated.evaluation.skipped });
    state.evaluations.push(evaluated.evaluation);
    result.evaluation = evaluated.evaluation;
    result.quality.push(evaluated.quality);
    if (evaluated.meta) result.metas.push({ kind: "evaluation", meta: evaluated.meta });
    followUp = evaluated.followUp;
  }

  if (followUp && !state.endedEarly) {
    state.questions.push(followUp);
    result.nextQuestion = followUp;
    return result;
  }

  const step = nextMainStep(state);
  if (step.kind === "done") {
    result.done = isFinished(state);
    return result;
  }

  const asked = await askMainQuestion(state, step.round, deps);
  state.questions.push(asked.question);
  result.nextQuestion = asked.question;
  result.quality.push(asked.quality);
  result.metas.push({ kind: "question", meta: asked.meta });
  result.toolActivity.push(...asked.activity);
  return result;
}

/** "End early": no more questions; the report covers what was answered. */
export function endEarly(input: InterviewState): InterviewState {
  const state = structuredClone(input);
  const pending = pendingQuestion(state);
  // An unanswered question is removed rather than counted as a skip: the candidate never got to it.
  if (pending) state.questions = state.questions.filter((question) => question.id !== pending.id);
  state.endedEarly = true;
  return state;
}
