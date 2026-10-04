/**
 * Agent evals: run scripted interviews against the fixture repos and print quality metrics.
 *
 *   pnpm eval                      (both fixtures, all three candidates)
 *   pnpm eval portfolio-new        (one fixture)
 *
 * Three scripted candidates answer every question:
 *   - good:  a simulated student (Gemma, shown the relevant file) who answers specifically
 *   - vague: canned answers with no substance
 *   - wrong: canned answers that are confidently incorrect
 *
 * What is measured:
 *   - validity:      model calls that produced schema-valid output (after at most one repair)
 *   - repair rate:   calls that needed the second attempt
 *   - real-file:     deep-dive questions that name a real file
 *   - invented:      file paths the model made up (all removed before a user would see them)
 *   - grounding:     follow-ups whose quoted phrase really appears in the answer (automatic check)
 *   - scores:        average score per candidate; good should clearly beat vague and wrong
 *   - latency:       median time of a question call and of an evaluation call
 *
 * Results are saved to fixtures/evals/ and briefs to fixtures/briefs/.
 * On a fixture with Entire checkpoint data (viva), it also checks that every interview asks
 * at least one question about AI-written code.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { FIXTURE_NAMES, loadFixture, type FixtureName } from "../src/lib/ingest/fixture";
import type { RepoSource } from "../src/lib/ingest/types";
import { generateStructured, type StructuredMeta } from "../src/lib/llm/structured";
import { getModelName, getProvider } from "../src/lib/llm/provider";
import { createBrief } from "../src/lib/interview/brief";
import { buildReport } from "../src/lib/interview/report";
import type { InterviewState, Question } from "../src/lib/interview/schemas";
import { createInterviewState } from "../src/lib/interview/state";
import { runTurn, type TurnQuality } from "../src/lib/interview/turn";
import { addAiHooks, loadProvenance } from "../src/lib/provenance";
import { createAgentDeps } from "../src/mastra/deps";

const MAIN_QUESTIONS = 5;
type Candidate = "good" | "vague" | "wrong";
const CANDIDATES: Candidate[] = ["good", "vague", "wrong"];

const VAGUE_ANSWERS = [
  "It basically just works, I used it because everyone uses it and it is the best option.",
  "I followed a tutorial for that part, it handles everything automatically so I did not need to think about it much.",
  "That is handled by the framework, I think it is pretty scalable and secure in general.",
];
const WRONG_ANSWERS = [
  "It stores everything on the blockchain so it can never fail or lose data, which is why I did not add any error handling.",
  "The frontend talks directly to the database with SQL, so there is no backend or API involved at all.",
  "It uses machine learning to compile the code at runtime, so performance is not a concern at any scale.",
];

/** The "good" candidate: Gemma plays the student, with the relevant file in front of it. */
async function goodAnswer(source: RepoSource, state: InterviewState, question: Question): Promise<string> {
  const file = question.filesRead[0];
  const code = file ? (await source.readFile(file).catch(() => "")).slice(0, 4000) : "";
  const { value } = await generateStructured({
    instructions:
      "You are the student who built this project, answering in a technical interview. " +
      "Answer in 3 to 5 sentences. Be specific to this project, explain why, and mention one trade-off or alternative.",
    prompt: [
      `Project summary: ${state.brief.summary}`,
      `Stack: ${state.brief.stack.join(", ")}`,
      code ? `Relevant code from ${file}:\n${code}` : "",
      `Interviewer's question: ${question.text}`,
    ].join("\n\n"),
    schema: z.object({ answer: z.string().min(1) }),
    fallback: { answer: "" },
  });
  return value.answer;
}

type Sample = { fixture: string; candidate: Candidate; question: string; answer: string; followUp: string; quoteFound: boolean };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${part}/${whole} (${Math.round((part / whole) * 100)}%)`;
}

async function main() {
  const requested = process.argv[2];
  const fixtures = (requested ? [requested] : [...FIXTURE_NAMES]) as FixtureName[];
  console.log(`provider=${getProvider()} model=${getModelName()} fixtures=${fixtures.join(",")} mainQuestions=${MAIN_QUESTIONS}`);

  mkdirSync("fixtures/briefs", { recursive: true });
  mkdirSync("fixtures/evals", { recursive: true });

  const metas: { kind: "brief" | "question" | "evaluation" | "report"; meta: StructuredMeta }[] = [];
  const qualities: TurnQuality[] = [];
  const samples: Sample[] = [];
  const scores: Record<Candidate, number[]> = { good: [], vague: [], wrong: [] };
  let briefInvented = 0;
  // One entry per interview on a fixture that has Entire checkpoints.
  const aiInterviews: { fixture: string; candidate: Candidate; aiQuestions: number; example: string }[] = [];
  // Main questions in the rounds where the agent has tools, with what it opened.
  const CODE_ROUNDS = ["decisions", "deep-dive", "failure-scale"];
  const codeQuestions: { fixture: string; round: string; filesRead: string[]; activity: string[]; question: string }[] = [];

  for (const name of fixtures) {
    const source = loadFixture(name);
    const briefResult = await createBrief(source);
    metas.push({ kind: "brief", meta: briefResult.meta });
    briefInvented += briefResult.inventedPathsDropped;
    // Entire provenance: fixtures with checkpoint data get "ai-authored" hooks added to their brief.
    const { provenance, checkpointCount } = await loadProvenance(source);
    const brief = addAiHooks(briefResult.brief, provenance);
    writeFileSync(path.join("fixtures/briefs", `${name}.json`), JSON.stringify(brief, null, 2));
    console.log(
      `\n[${name}] brief in ${briefResult.meta.ms} ms: ${briefResult.brief.hooks.length} hooks, ` +
        `${briefResult.inventedPathsDropped} invented paths dropped, fallback=${briefResult.meta.usedFallback}, ` +
        `${checkpointCount} checkpoints, ${new Set(provenance.map((entry) => entry.path)).size} AI-written files`,
    );

    for (const candidate of CANDIDATES) {
      let state = createInterviewState({
        repoId: source.id,
        repoLabel: source.label,
        filePaths: source.files.map((file) => file.path),
        brief,
        provenance,
        settings: { mainQuestions: MAIN_QUESTIONS, persona: "tough" },
      });
      // The Mastra interviewer agent writes the code questions; it opens files with its readFile tool.
      const deps = createAgentDeps(source, state.settings, provenance);

      // Collect the quality facts and call timings of every turn.
      const collect = (result: Awaited<ReturnType<typeof runTurn>>) => {
        qualities.push(...result.quality);
        metas.push(...result.metas);
      };

      let turn = await runTurn(state, undefined, deps);
      collect(turn);
      let answerIndex = 0;
      while (turn.nextQuestion) {
        state = turn.state;
        const question = turn.nextQuestion;

        const answer =
          candidate === "good"
            ? await goodAnswer(source, state, question)
            : (candidate === "vague" ? VAGUE_ANSWERS : WRONG_ANSWERS)[answerIndex++ % 3];

        turn = await runTurn(state, answer, deps);
        collect(turn);
        if (turn.evaluation?.evaluated) scores[candidate].push(turn.evaluation.score);
        const next = turn.nextQuestion;
        if (next && !next.isFollowUp && CODE_ROUNDS.includes(next.round)) {
          codeQuestions.push({ fixture: name, round: next.round, filesRead: next.filesRead, activity: turn.toolActivity, question: next.text });
        }
        if (turn.nextQuestion?.isFollowUp) {
          const grounded = turn.quality.find((q) => q.followUpReferencesAnswer !== null)?.followUpReferencesAnswer ?? false;
          samples.push({ fixture: name, candidate, question: question.text, answer, followUp: turn.nextQuestion.text, quoteFound: grounded });
        }
      }
      state = turn.state;

      // On a repo with checkpoints, every interview must contain at least one question about AI-written code.
      if (provenance.length > 0) {
        const aiQuestions = state.questions.filter((question) => question.aboutAiCode && !question.isFollowUp);
        aiInterviews.push({ fixture: name, candidate, aiQuestions: aiQuestions.length, example: aiQuestions[0]?.text ?? "" });
      }

      const { report, meta } = await buildReport(state);
      metas.push({ kind: "report", meta });
      console.log(
        `[${name}] ${candidate}: ${state.questions.length} questions (${state.questions.filter((q) => q.isFollowUp).length} follow-ups), ` +
          `overall ${report.overall}/4, ${report.readiness}`,
      );
    }
  }

  // ---- metrics ----
  const calls = metas.length;
  const fallbacks = metas.filter((m) => m.meta.usedFallback).length;
  const repairs = metas.filter((m) => m.meta.repaired).length;
  const deepDives = qualities.filter((q) => q.questionNamesRealFile !== null);
  const followUps = qualities.filter((q) => q.followUpReferencesAnswer !== null);
  const medianMs = (kind: string) => median(metas.filter((m) => m.kind === kind && !m.meta.rateLimited).map((m) => m.meta.ms - m.meta.pacedMs));
  const average = (values: number[]) => (values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : "n/a");

  const summary = {
    date: new Date().toISOString(),
    provider: getProvider(),
    model: getModelName(),
    fixtures,
    mainQuestions: MAIN_QUESTIONS,
    modelCalls: calls,
    validAfterRepair: percent(calls - fallbacks, calls),
    neededRepair: percent(repairs, calls),
    deepDiveNamesRealFile: percent(deepDives.filter((q) => q.questionNamesRealFile).length, deepDives.length),
    interviewsWithAiCodeQuestion: percent(aiInterviews.filter((interview) => interview.aiQuestions > 0).length, aiInterviews.length),
    agentOpenedAFile: percent(codeQuestions.filter((q) => q.filesRead.length > 0).length, codeQuestions.length),
    agentRefusedInventedPath: codeQuestions.filter((q) => q.activity.some((line) => line.startsWith("refused"))).length,
    inventedPathsDropped: { inBriefs: briefInvented, inQuestions: qualities.filter((q) => q.inventedPathDropped).length },
    followUpQuoteFoundInAnswer: percent(followUps.filter((q) => q.followUpReferencesAnswer).length, followUps.length),
    averageScore: { good: average(scores.good), vague: average(scores.vague), wrong: average(scores.wrong) },
    // Latency medians leave out time spent waiting for the tokens-per-minute budget, and rate-limited calls entirely.
    rateLimitedCalls: percent(metas.filter((m) => m.meta.rateLimited).length, calls),
    callsThatWaitedForBudget: percent(metas.filter((m) => m.meta.pacedMs > 0).length, calls),
    inputTokens: metas.reduce((sum, m) => sum + (m.meta.inputTokens ?? 0), 0),
    medianMs: {
      brief: medianMs("brief"),
      question: medianMs("question"),
      evaluation: medianMs("evaluation"),
      report: medianMs("report"),
    },
    errors: [...new Set(metas.map((m) => m.meta.error).filter(Boolean))],
  };

  console.log("\n==== EVAL SUMMARY ====");
  console.log(JSON.stringify(summary, null, 2));
  // A single-fixture run writes summary-<fixture>.json etc., so it does not overwrite the full run's files.
  const suffix = requested ? `-${requested}` : "";
  const out = (name: string) => `fixtures/evals/${name}${suffix}.json`;
  writeFileSync(out("summary"), JSON.stringify(summary, null, 2));
  // Follow-up samples for the manual grounding check (read 10 of them by hand).
  writeFileSync(out("followup-samples"), JSON.stringify(samples, null, 2));
  // What the agent opened before each code question (examples for the post).
  writeFileSync(out("agent-questions"), JSON.stringify(codeQuestions, null, 2));
  writeFileSync(out("ai-code-questions"), JSON.stringify(aiInterviews, null, 2));
  console.log(`\nSaved ${out("summary")}, ${samples.length} follow-up samples and ${codeQuestions.length} agent questions.`);
}

main();
