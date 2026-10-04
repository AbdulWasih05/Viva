/**
 * Every prompt Viva sends to Gemma, as plain template functions.
 * Keeping them in one file makes them easy to read, compare and quote.
 */
import type { FileContent } from "../ingest/types";
import type { Hook, InterviewState, Persona, Question, Round } from "./schemas";

/** How many file paths are listed in a prompt. Enough for student projects; keeps huge repos from flooding the prompt. */
export const MAX_PATHS_IN_PROMPT = 150;

// ---- personas ------------------------------------------------------------------------------

const PERSONA_INSTRUCTIONS: Record<Persona, string> = {
  friendly:
    "You are a friendly HR-round interviewer at a campus placement drive. You are warm and encouraging, " +
    "you use simple language, and you care about whether the candidate can explain their own work clearly. " +
    "You still expect real answers and you ask for an example when an answer is vague.",
  tough:
    "You are a tough tech lead interviewing a final-year student. You are direct and unsentimental. " +
    "You do not accept buzzwords: you ask why, what breaks, and what the alternative was. " +
    "You are never rude, but you do not praise an answer that has not earned it.",
};

export function interviewerInstructions(persona: Persona, targetRole: string): string {
  return [
    PERSONA_INSTRUCTIONS[persona],
    `The candidate is applying for: ${targetRole}.`,
    "You are interviewing them about ONE project that they built. Only ask about this project.",
    "Ask exactly one question at a time, in at most two sentences. Never answer the question yourself.",
    "Only mention file paths that appear in the list of real files you are given. Never invent a file, function or library.",
  ].join("\n");
}

// ---- project brief -------------------------------------------------------------------------

export const BRIEF_INSTRUCTIONS =
  "You are a senior engineer preparing to interview a student about a project they built. " +
  "You read their repository and write a short, factual brief. " +
  "You only state what the files show. You never invent files, functions or features.";

function formatFiles(contents: FileContent[]): string {
  return contents
    .map((file) => `--- ${file.path}${file.truncated ? " (truncated)" : ""} ---\n${file.content}`)
    .join("\n\n");
}

export function briefPrompt(input: { filePaths: string[]; contents: FileContent[]; correction?: string }): string {
  return [
    "ALL FILE PATHS IN THE REPO:",
    input.filePaths.join("\n"),
    "",
    "CONTENTS OF THE MOST IMPORTANT FILES:",
    formatFiles(input.contents),
    "",
    input.correction ? `THE CANDIDATE ADDED THIS CORRECTION (trust it): ${input.correction}\n` : "",
    "Write the project brief:",
    "- summary: 2 or 3 sentences on what the project does and how it is built.",
    "- stack: languages, frameworks and services actually used.",
    "- components: 3 to 6 main parts, each with its purpose and the files that implement it.",
    "- decisions: design decisions visible in the code (for example a database choice or an API design).",
    "- risks: things that could fail, be slow, or be insecure, as visible in the code.",
    "- hooks: 6 to 10 specific things worth asking about in an interview. Mix the kinds:",
    '  "file" or "function" hooks must set `file` to a path copied exactly from ALL FILE PATHS;',
    '  "decision" and "risk" hooks set `file` to the related path, or null if there is none.',
    "Every file path you write must be copied exactly from ALL FILE PATHS IN THE REPO.",
  ].join("\n");
}

// ---- questions -----------------------------------------------------------------------------

const ROUND_GOALS: Record<Round, string> = {
  overview: "Open the interview. Ask the candidate to walk you through the project: what it does, for whom, and how it is put together.",
  decisions: "Ask WHY a specific design decision was made and what alternative was considered.",
  "deep-dive": "Ask how a specific piece of the code works. Name the file. The candidate should have to explain the logic, not just describe the feature.",
  "failure-scale": "Ask what happens when something fails, or how this would behave with 100 times the users or data.",
  "wrap-up": "Close the interview. Ask what they would change or build next if they had another month, and why.",
};

/** A compact transcript so the model knows what was already asked and answered. */
function formatHistory(state: InterviewState): string {
  if (state.questions.length === 0) return "(nothing asked yet)";
  return state.questions
    .map((question) => {
      const answer = state.answers.find((a) => a.questionId === question.id);
      const answerText = !answer ? "(not answered yet)" : answer.skipped ? "(skipped)" : answer.text.slice(0, 400);
      return `Q (${question.round}): ${question.text}\nA: ${answerText}`;
    })
    .join("\n");
}

function formatBrief(state: InterviewState): string {
  const { brief } = state;
  return [
    `Project: ${state.repoLabel}`,
    `Summary: ${brief.summary}`,
    `Stack: ${brief.stack.join(", ")}`,
    `Decisions: ${brief.decisions.join(" | ")}`,
    `Risks: ${brief.risks.join(" | ")}`,
    state.userCorrection ? `Candidate's correction: ${state.userCorrection}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function questionPrompt(input: {
  state: InterviewState;
  round: Round;
  hook?: Hook;
  /** Content of the hook's file, when there is one. */
  file?: FileContent;
  /** A topic from a previous session to retest (Phase 2 memory). */
  retestTopic?: string;
}): string {
  const { state, round, hook, file, retestTopic } = input;
  return [
    "PROJECT BRIEF:",
    formatBrief(state),
    "",
    "REAL FILE PATHS:",
    state.filePaths.slice(0, MAX_PATHS_IN_PROMPT).join("\n"),
    "",
    "INTERVIEW SO FAR:",
    formatHistory(state),
    "",
    `THIS QUESTION'S ROUND: ${round}. ${ROUND_GOALS[round]}`,
    hook ? `ASK ABOUT THIS: (${hook.kind}) ${hook.ref}. Why it matters: ${hook.why}` : "",
    file ? `CODE FROM ${file.path}:\n${file.content}` : "",
    retestTopic ? `The candidate struggled with "${retestTopic}" in their last session. Retest that topic now and say that you are coming back to it.` : "",
    "",
    "Write the next question. Do not repeat a question already asked.",
    "- text: the question, at most two sentences, spoken directly to the candidate.",
    "- file: the one file path the question is about, copied exactly from REAL FILE PATHS, or null.",
    "- rubric.mustMention: 2 to 4 points a correct answer has to include.",
    "- rubric.goodSignals: 1 to 3 things that would make the answer excellent (trade-offs, alternatives).",
    "- rubric.redFlags: 1 to 3 signs the candidate does not understand their own code.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ---- evaluation ----------------------------------------------------------------------------

export const SCORING_RUBRIC = [
  "0 = no answer, or wrong",
  "1 = vague, not specific to this project",
  "2 = correct but shallow",
  "3 = solid and specific",
  "4 = excellent, with trade-offs or alternatives",
].join("\n");

export function evaluationPrompt(input: {
  state: InterviewState;
  question: Question;
  answer: string;
  /** False when the follow-up limit for this question is already reached. */
  followUpAllowed: boolean;
}): string {
  const { state, question, answer, followUpAllowed } = input;
  return [
    "PROJECT BRIEF:",
    formatBrief(state),
    "",
    `QUESTION (${question.round}): ${question.text}`,
    `A good answer must mention: ${question.rubric.mustMention.join("; ") || "(no rubric)"}`,
    `Excellent if it shows: ${question.rubric.goodSignals.join("; ") || "(none listed)"}`,
    `Red flags: ${question.rubric.redFlags.join("; ") || "(none listed)"}`,
    "",
    `CANDIDATE'S ANSWER:\n"""${answer}"""`,
    "",
    "Evaluate the answer. Judge only what the candidate actually said.",
    `SCORE SCALE:\n${SCORING_RUBRIC}`,
    "- answerSummary: one sentence saying what the candidate claimed.",
    "- good: points they got right (may be empty).",
    "- missing: rubric points they did not cover (may be empty).",
    followUpAllowed
      ? [
          "- followUp: decide whether one follow-up question is worth asking.",
          "  Ask one when the answer was vague, contained a claim worth testing, or skipped a must-mention point.",
          "  The follow-up MUST build on something the candidate actually said:",
          "  set `quote` to a short phrase (3 to 12 words) copied word for word from their answer,",
          "  and write `question` so that it refers to that phrase.",
          "  If no follow-up is needed, set ask to false and question and quote to null.",
        ].join("\n")
      : "- followUp: set ask to false, question and quote to null (the follow-up limit is reached).",
  ].join("\n");
}

// ---- report --------------------------------------------------------------------------------

export const REPORT_INSTRUCTIONS =
  "You are an interview coach writing feedback for a student after a mock interview about their own project. " +
  "Be specific and practical. Base everything on the transcript you are given; do not invent events.";

export function reportPrompt(state: InterviewState): string {
  const transcript = state.questions
    .map((question) => {
      const evaluation = state.evaluations.find((e) => e.questionId === question.id);
      if (!evaluation) return "";
      return [
        `Q (${question.round}): ${question.text}`,
        `Answer summary: ${evaluation.skipped ? "(skipped)" : evaluation.answerSummary}`,
        `Score: ${evaluation.score}/4`,
        `Got right: ${evaluation.good.join("; ") || "-"}`,
        `Missed: ${evaluation.missing.join("; ") || "-"}`,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  return [
    "PROJECT BRIEF:",
    formatBrief(state),
    "",
    "EVALUATED TRANSCRIPT:",
    transcript,
    "",
    "Write the coaching part of the report:",
    "- strengths: 2 to 4 things the candidate did well, each tied to a specific answer.",
    "- weakSpots: the 3 to 5 topics they most need to work on. `topic` is a short name; `evidence` is what they said or missed.",
    "- revisionList: 4 to 8 concrete things to revise before a real interview (for example 'how JWT refresh tokens are rotated').",
    "- likelyNextQuestions: exactly 5 questions a real interviewer would probably ask about this project next.",
  ].join("\n");
}
