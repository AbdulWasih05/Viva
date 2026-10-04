/**
 * Every data shape in an interview, as zod schemas.
 *
 * Two kinds of schema live here:
 *   - "Draft" schemas describe what we ask Gemma to write. They are small on purpose,
 *     because a model fills in a short form more reliably than a long one.
 *   - The full schemas add the fields our own code is responsible for (ids, rounds, flags).
 */
import { z } from "zod";

// ---- settings ------------------------------------------------------------------------------

export const PersonaSchema = z.enum(["friendly", "tough"]);
export type Persona = z.infer<typeof PersonaSchema>;

/** "retest" questions come first in a returning session: they revisit last session's weak spots. */
export const RoundSchema = z.enum(["retest", "overview", "decisions", "deep-dive", "failure-scale", "wrap-up"]);
export type Round = z.infer<typeof RoundSchema>;

export const SettingsSchema = z.object({
  persona: PersonaSchema.default("tough"),
  /** Number of main questions (follow-ups come on top). */
  mainQuestions: z.number().int().min(5).max(12).default(8),
  maxFollowUps: z.number().int().min(0).max(2).default(2),
  targetRole: z.string().default("Software engineer (campus placement)"),
});
export type Settings = z.infer<typeof SettingsSchema>;

// ---- project brief -------------------------------------------------------------------------

export const HookKindSchema = z.enum(["file", "function", "decision", "risk", "ai-authored"]);

/** What Gemma writes after reading the repo. */
export const BriefDraftSchema = z.object({
  summary: z.string().min(1),
  stack: z.array(z.string()),
  components: z.array(z.object({ name: z.string(), purpose: z.string(), files: z.array(z.string()) })),
  decisions: z.array(z.string()),
  risks: z.array(z.string()),
  hooks: z.array(
    z.object({
      kind: z.enum(["file", "function", "decision", "risk"]),
      /** Short label for the thing to ask about, for example a function name or a design choice. */
      ref: z.string(),
      /** The file this hook is about, or null when it is not tied to one file. */
      file: z.string().nullable(),
      why: z.string(),
    }),
  ),
});
export type BriefDraft = z.infer<typeof BriefDraftSchema>;

export const HookSchema = z.object({
  id: z.string(),
  kind: HookKindSchema,
  ref: z.string(),
  file: z.string().nullable(),
  why: z.string(),
});
export type Hook = z.infer<typeof HookSchema>;

export const ProjectBriefSchema = z.object({
  summary: z.string(),
  stack: z.array(z.string()),
  components: z.array(z.object({ name: z.string(), purpose: z.string(), files: z.array(z.string()) })),
  decisions: z.array(z.string()),
  risks: z.array(z.string()),
  hooks: z.array(HookSchema),
});
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;

// ---- provenance (filled in Phase 3) --------------------------------------------------------

export const ProvenanceEntrySchema = z.object({
  path: z.string(),
  commit: z.string(),
  checkpointId: z.string(),
  promptSummary: z.string(),
  scope: z.enum(["file", "lines"]),
  lines: z.string().optional(),
  /**
   * How we know: "attribution" = Entire's own per-file data; "commit" = the file was changed in a
   * commit linked to an agent session (the fallback when Entire's file list is incomplete).
   */
  source: z.enum(["attribution", "commit"]).optional(),
});
export type ProvenanceEntry = z.infer<typeof ProvenanceEntrySchema>;

// ---- questions -----------------------------------------------------------------------------

export const RubricSchema = z.object({
  mustMention: z.array(z.string()),
  goodSignals: z.array(z.string()),
  redFlags: z.array(z.string()),
});

/** What Gemma writes when asked for the next main question. */
export const QuestionDraftSchema = z.object({
  text: z.string().min(1),
  /** The file the question is about, or null. Checked against the real file list. */
  file: z.string().nullable(),
  rubric: RubricSchema,
});
export type QuestionDraft = z.infer<typeof QuestionDraftSchema>;

export const QuestionSchema = z.object({
  id: z.string(),
  round: RoundSchema,
  persona: PersonaSchema,
  text: z.string(),
  hookId: z.string().optional(),
  filesRead: z.array(z.string()),
  rubric: RubricSchema,
  isFollowUp: z.boolean(),
  parentId: z.string().optional(),
  aboutAiCode: z.boolean(),
  /** Set on a retest question: the weak-spot topic from last session that it revisits. */
  retestTopic: z.string().optional(),
});
export type Question = z.infer<typeof QuestionSchema>;

// ---- evaluation ----------------------------------------------------------------------------

/** What Gemma writes after reading the candidate's answer. */
export const EvaluationDraftSchema = z.object({
  answerSummary: z.string(),
  score: z.number().int().min(0).max(4),
  good: z.array(z.string()),
  missing: z.array(z.string()),
  followUp: z.object({
    ask: z.boolean(),
    /** The follow-up question, or null when ask is false. */
    question: z.string().nullable(),
    /** A short phrase copied word for word from the candidate's answer that the follow-up builds on. */
    quote: z.string().nullable(),
    /** Why a follow-up is or is not needed. The model often leaves it null when it asks nothing. */
    reason: z.string().nullable(),
  }),
});
export type EvaluationDraft = z.infer<typeof EvaluationDraftSchema>;

export const EvaluationSchema = z.object({
  questionId: z.string(),
  answerSummary: z.string(),
  score: z.number().int().min(0).max(4),
  good: z.array(z.string()),
  missing: z.array(z.string()),
  followUp: z.object({ ask: z.boolean(), reason: z.string() }),
  /** False when the model failed and this is a placeholder; such answers are left out of averages. */
  evaluated: z.boolean(),
  skipped: z.boolean(),
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

// ---- delivery (filled in Phase 6) and memory (Phase 2) -------------------------------------

export const DeliveryMetricsSchema = z.object({
  durationSec: z.number(),
  words: z.number(),
  wpm: z.number(),
  fillerCount: z.number(),
  fillerRate: z.number(),
  longPauses: z.array(z.object({ start: z.number(), end: z.number() })),
  fillersByWord: z.record(z.string(), z.number()),
});
export type DeliveryMetrics = z.infer<typeof DeliveryMetricsSchema>;

export const WeakSpotSchema = z.object({
  topic: z.string(),
  evidence: z.string(),
  lastScore: z.number(),
  sessionDate: z.string(),
});
export type WeakSpot = z.infer<typeof WeakSpotSchema>;

// ---- interview state -----------------------------------------------------------------------

export const AnswerSchema = z.object({ questionId: z.string(), text: z.string(), skipped: z.boolean() });
export type Answer = z.infer<typeof AnswerSchema>;

/**
 * The whole interview. It travels with the client between requests, so the server stays stateless.
 * `questions`, `answers` and `evaluations` line up by questionId.
 */
export const InterviewStateSchema = z.object({
  repoId: z.string(),
  repoLabel: z.string(),
  /** Every real file path in the repo; model-mentioned paths are checked against this. */
  filePaths: z.array(z.string()),
  brief: ProjectBriefSchema,
  provenance: z.array(ProvenanceEntrySchema),
  userCorrection: z.string().optional(),
  previousWeakSpots: z.array(WeakSpotSchema),
  settings: SettingsSchema,
  /** The round of each main question, decided up front (see planRounds). */
  roundPlan: z.array(RoundSchema),
  questions: z.array(QuestionSchema),
  answers: z.array(AnswerSchema),
  evaluations: z.array(EvaluationSchema),
  delivery: z.array(DeliveryMetricsSchema.extend({ questionId: z.string() })),
  endedEarly: z.boolean(),
});
export type InterviewState = z.infer<typeof InterviewStateSchema>;

// ---- report --------------------------------------------------------------------------------

/** The parts of the report Gemma writes. Scores and averages are computed in code. */
export const ReportDraftSchema = z.object({
  strengths: z.array(z.string()),
  weakSpots: z.array(z.object({ topic: z.string(), evidence: z.string() })),
  revisionList: z.array(z.string()),
  likelyNextQuestions: z.array(z.string()),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

export const ReportSchema = z.object({
  /** Average score from 0 to 4 over the answers that were evaluated. */
  overall: z.number(),
  readiness: z.string(),
  perQuestion: z.array(
    z.object({
      questionId: z.string(),
      round: RoundSchema,
      question: z.string(),
      answerSummary: z.string(),
      score: z.number(),
      good: z.array(z.string()),
      missing: z.array(z.string()),
      isFollowUp: z.boolean(),
      aboutAiCode: z.boolean(),
      skipped: z.boolean(),
    }),
  ),
  strengths: z.array(z.string()),
  weakSpots: z.array(WeakSpotSchema),
  revisionList: z.array(z.string()),
  likelyNextQuestions: z.array(z.string()),
  deliverySummary: z.string().nullable(),
  progressVsLast: z.array(z.object({ topic: z.string(), before: z.number(), after: z.number() })),
});
export type Report = z.infer<typeof ReportSchema>;
