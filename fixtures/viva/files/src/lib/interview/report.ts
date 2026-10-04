/**
 * The final report. All numbers (scores, averages, readiness) are computed here in code.
 * Gemma only writes the coaching text: strengths, weak spots, revision list, likely next questions.
 */
import { generateStructured, type GenerateFn, type StructuredMeta } from "../llm/structured";
import { LONG_CALL_TIMEOUT_MS } from "./brief";
import { REPORT_INSTRUCTIONS, reportPrompt } from "./prompts";
import { ReportDraftSchema, type InterviewState, type Report, type ReportDraft, type Round, type WeakSpot } from "./schemas";
import { mainQuestionOf } from "./state";

/** Average of the evaluated answers, rounded to one decimal. 0 when nothing was evaluated. */
export function averageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
}

/** Maps the 0 to 4 average onto a plain-language readiness label. */
export function readinessLabel(average: number, answered: number): string {
  if (answered === 0) return "Not enough answers to judge";
  if (average < 1.5) return "Not ready yet";
  if (average < 2.5) return "Getting there";
  if (average < 3.25) return "Nearly ready";
  return "Interview ready";
}

export function computeStats(state: InterviewState): {
  overall: number;
  readiness: string;
  byRound: Partial<Record<Round, number>>;
  perQuestion: Report["perQuestion"];
} {
  const perQuestion: Report["perQuestion"] = [];
  for (const question of state.questions) {
    const evaluation = state.evaluations.find((e) => e.questionId === question.id);
    if (!evaluation) continue;
    perQuestion.push({
      questionId: question.id,
      round: question.round,
      question: question.text,
      answerSummary: evaluation.answerSummary,
      score: evaluation.score,
      good: evaluation.good,
      missing: evaluation.missing,
      isFollowUp: question.isFollowUp,
      aboutAiCode: question.aboutAiCode,
      skipped: evaluation.skipped,
    });
  }

  // Placeholder evaluations (model failed) are left out of every average.
  const counted = state.evaluations.filter((evaluation) => evaluation.evaluated);
  const overall = averageScore(counted.map((evaluation) => evaluation.score));

  const byRound: Partial<Record<Round, number>> = {};
  for (const round of new Set(state.roundPlan)) {
    const scores = counted
      .filter((evaluation) => {
        const question = state.questions.find((q) => q.id === evaluation.questionId);
        return question !== undefined && mainQuestionOf(state, question).round === round;
      })
      .map((evaluation) => evaluation.score);
    if (scores.length > 0) byRound[round] = averageScore(scores);
  }

  return { overall, readiness: readinessLabel(overall, counted.length), byRound, perQuestion };
}

/**
 * Progress on the topics retested from last session.
 * "before" is the score remembered from last time; "after" is the average of this session's
 * retest question and its follow-ups on that topic.
 */
export function progressVsLast(state: InterviewState): Report["progressVsLast"] {
  const progress: Report["progressVsLast"] = [];
  for (const retest of state.questions.filter((q) => q.round === "retest" && !q.isFollowUp && q.retestTopic)) {
    const scores = state.evaluations
      .filter((evaluation) => {
        const question = state.questions.find((q) => q.id === evaluation.questionId);
        return evaluation.evaluated && question !== undefined && mainQuestionOf(state, question).id === retest.id;
      })
      .map((evaluation) => evaluation.score);
    const before = state.previousWeakSpots.find((spot) => spot.topic === retest.retestTopic);
    if (scores.length === 0 || !before) continue;
    progress.push({ topic: before.topic, before: before.lastScore, after: averageScore(scores) });
  }
  return progress;
}

/** A retested topic counts as fixed once the candidate scores at least this on it. */
const FIXED_SCORE = 3;
const MAX_REMEMBERED = 5;

/**
 * What to remember for next time: retested topics that are still weak come first (so they are
 * retested again), then this session's new weak spots. No duplicates, at most five.
 */
export function weakSpotsToRemember(report: Report, sessionDate: string): WeakSpot[] {
  const stillWeak: WeakSpot[] = report.progressVsLast
    .filter((item) => item.after < FIXED_SCORE)
    .map((item) => ({ topic: item.topic, evidence: "Still weak when retested.", lastScore: item.after, sessionDate }));
  const retested = new Set(report.progressVsLast.map((item) => item.topic.toLowerCase()));
  const fresh = report.weakSpots.filter((spot) => !retested.has(spot.topic.toLowerCase()));
  return [...stillWeak, ...fresh].slice(0, MAX_REMEMBERED);
}

/** Used when the model fails twice: coaching text assembled from the evaluations themselves. */
export function fallbackReportDraft(state: InterviewState): ReportDraft {
  const weakest = state.evaluations
    .filter((evaluation) => evaluation.evaluated && evaluation.score <= 2)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
  const questionText = (id: string) => state.questions.find((q) => q.id === id)?.text ?? id;
  return {
    strengths: state.evaluations.flatMap((evaluation) => evaluation.good).slice(0, 4),
    weakSpots: weakest.map((evaluation) => ({
      topic: questionText(evaluation.questionId).slice(0, 80),
      evidence: evaluation.missing.join("; ") || evaluation.answerSummary,
    })),
    revisionList: [...new Set(state.evaluations.flatMap((evaluation) => evaluation.missing))].slice(0, 8),
    likelyNextQuestions: [],
  };
}

export async function buildReport(
  state: InterviewState,
  options: { generate?: GenerateFn; today?: string } = {},
): Promise<{ report: Report; meta: StructuredMeta }> {
  const stats = computeStats(state);
  const { value: draft, meta } = await generateStructured({
    instructions: REPORT_INSTRUCTIONS,
    prompt: reportPrompt(state),
    schema: ReportDraftSchema,
    fallback: fallbackReportDraft(state),
    timeoutMs: LONG_CALL_TIMEOUT_MS,
    generate: options.generate,
  });

  const sessionDate = options.today ?? new Date().toISOString().slice(0, 10);
  const report: Report = {
    overall: stats.overall,
    readiness: stats.readiness,
    perQuestion: stats.perQuestion,
    strengths: draft.strengths,
    // The model names the weak topics; the score attached to each is the session average, a number we computed.
    weakSpots: draft.weakSpots.slice(0, 5).map((spot) => ({ ...spot, lastScore: stats.overall, sessionDate })),
    revisionList: draft.revisionList,
    likelyNextQuestions: draft.likelyNextQuestions.slice(0, 5),
    deliverySummary: null, // Phase 6
    progressVsLast: progressVsLast(state),
  };
  return { report, meta };
}

function bullets(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- (none)";
}

export function reportToMarkdown(report: Report, repoLabel: string): string {
  const questions = report.perQuestion
    .map((q) =>
      [
        `### ${q.questionId}${q.isFollowUp ? " (follow-up)" : ""} · ${q.round}${q.aboutAiCode ? " · AI-written code" : ""} · ${q.skipped ? "skipped" : `${q.score}/4`}`,
        `**Q:** ${q.question}`,
        `**Your answer:** ${q.answerSummary}`,
        q.good.length > 0 ? `**Good:** ${q.good.join("; ")}` : "",
        q.missing.length > 0 ? `**Missing:** ${q.missing.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    )
    .join("\n\n");

  return [
    `# Viva report: ${repoLabel}`,
    `**Overall:** ${report.overall}/4 · **Readiness:** ${report.readiness}`,
    `## Strengths\n${bullets(report.strengths)}`,
    `## Weak spots\n${bullets(report.weakSpots.map((spot) => `**${spot.topic}:** ${spot.evidence}`))}`,
    `## Revise before the real interview\n${bullets(report.revisionList)}`,
    `## Likely next questions\n${bullets(report.likelyNextQuestions)}`,
    report.deliverySummary ? `## How you said it\n${report.deliverySummary}` : "",
    report.progressVsLast.length > 0
      ? `## Progress since last session\n${bullets(report.progressVsLast.map((p) => `**${p.topic}:** ${p.before}/4 last time, ${p.after}/4 now`))}`
      : "",
    `## Question by question\n\n${questions}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
