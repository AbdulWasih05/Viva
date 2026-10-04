import { describe, expect, it } from "vitest";
import type { GenerateFn } from "../llm/structured";
import { normalizePath, validateBrief } from "./brief";
import { averageScore, buildReport, computeStats, readinessLabel, reportToMarkdown } from "./report";
import type { BriefDraft, EvaluationDraft, InterviewState, ProjectBrief, QuestionDraft } from "./schemas";
import { createInterviewState, followUpCount, isFinished, mainQuestionCount, nextMainStep, pendingQuestion, pickHook, planRounds } from "./state";
import { endEarly, isSkip, quoteAppearsInAnswer, runTurn } from "./turn";

const FILES = ["README.md", "src/auth.ts", "src/db.ts"];

const BRIEF: ProjectBrief = {
  summary: "A demo API.",
  stack: ["TypeScript"],
  components: [],
  decisions: ["JWT auth"],
  risks: ["No rate limiting"],
  hooks: [
    { id: "h1", kind: "decision", ref: "JWT instead of sessions", file: null, why: "core choice" },
    { id: "h2", kind: "file", ref: "auth flow", file: "src/auth.ts", why: "central" },
    { id: "h3", kind: "risk", ref: "no rate limiting", file: null, why: "abuse" },
  ],
};

function newState(settings = {}): InterviewState {
  return createInterviewState({ repoId: "test:repo", repoLabel: "repo", filePaths: FILES, brief: BRIEF, settings });
}

const rubric = { mustMention: ["point A"], goodSignals: [], redFlags: [] };

/**
 * A fake model. It tells question prompts from evaluation prompts by their text and
 * answers with whatever the test configured.
 */
function fakeModel(options: { question?: Partial<QuestionDraft>; evaluation?: Partial<EvaluationDraft> } = {}): GenerateFn {
  return async ({ prompt }) => {
    if (prompt.includes("CANDIDATE'S ANSWER")) {
      const evaluation: EvaluationDraft = {
        answerSummary: "They explained it.",
        score: 3,
        good: ["clear"],
        missing: [],
        followUp: { ask: false, question: null, quote: null, reason: "complete" },
        ...options.evaluation,
      };
      return { object: evaluation };
    }
    if (prompt.includes("EVALUATED TRANSCRIPT")) {
      return { object: { strengths: ["s"], weakSpots: [{ topic: "t", evidence: "e" }], revisionList: ["r"], likelyNextQuestions: ["1", "2", "3", "4", "5", "6"] } };
    }
    const question: QuestionDraft = { text: "How does it work?", file: null, rubric, ...options.question };
    return { object: question };
  };
}

const deps = (generate: GenerateFn) => ({ generate, readFile: async (path: string) => `// contents of ${path}` });

describe("planRounds", () => {
  it("gives the right number of rounds, starting with overview and ending with wrap-up", () => {
    for (let n = 5; n <= 12; n++) {
      const plan = planRounds(n);
      expect(plan).toHaveLength(n);
      expect(plan[0]).toBe("overview");
      expect(plan[n - 1]).toBe("wrap-up");
      for (const round of ["decisions", "deep-dive", "failure-scale"]) expect(plan).toContain(round);
    }
  });

  it("matches the documented split for 8 questions", () => {
    expect(planRounds(8)).toEqual(["overview", "decisions", "decisions", "deep-dive", "deep-dive", "deep-dive", "failure-scale", "wrap-up"]);
  });
});

describe("validateBrief", () => {
  const draft: BriefDraft = {
    summary: "s",
    stack: [],
    components: [{ name: "auth", purpose: "p", files: ["src/auth.ts", "src/invented.ts"] }],
    decisions: [],
    risks: [],
    hooks: [
      { kind: "file", ref: "real", file: "./src/auth.ts", why: "w" },
      { kind: "function", ref: "made up", file: "src/ghost.ts", why: "w" },
      { kind: "decision", ref: "choice", file: "src/nope.ts", why: "w" },
      { kind: "risk", ref: "risk", file: null, why: "w" },
    ],
  };

  it("drops invented paths and counts them", () => {
    const { brief, inventedPathsDropped } = validateBrief(draft, FILES);
    expect(inventedPathsDropped).toBe(3);
    expect(brief.components[0].files).toEqual(["src/auth.ts"]);
    // The invented "function" hook is gone; the "decision" hook stays without its path.
    expect(brief.hooks.map((hook) => hook.ref)).toEqual(["real", "choice", "risk"]);
    expect(brief.hooks.find((hook) => hook.ref === "choice")?.file).toBeNull();
    expect(brief.hooks.map((hook) => hook.id)).toEqual(["h1", "h2", "h3"]);
  });

  it("treats ./ and backslash spellings as the same real path", () => {
    expect(normalizePath("./src\\auth.ts")).toBe("src/auth.ts");
    expect(validateBrief(draft, FILES).brief.hooks[0].file).toBe("src/auth.ts");
  });
});

describe("state machine", () => {
  it("picks hooks that suit the round and never reuses one", () => {
    const state = newState();
    expect(pickHook(state, "overview")).toBeUndefined();
    expect(pickHook(state, "decisions")?.id).toBe("h1");
    expect(pickHook(state, "deep-dive")?.id).toBe("h2");
    expect(pickHook(state, "failure-scale")?.id).toBe("h3");
  });

  it("runs a full interview: one question per turn, then done", async () => {
    let state = newState({ mainQuestions: 5 });
    const generate = fakeModel();

    let turn = await runTurn(state, undefined, deps(generate));
    expect(turn.nextQuestion?.id).toBe("q1");
    expect(turn.nextQuestion?.round).toBe("overview");
    state = turn.state;

    for (let i = 0; i < 5; i++) {
      expect(pendingQuestion(state)).toBeDefined();
      turn = await runTurn(state, "A specific and complete answer about the code.", deps(generate));
      state = turn.state;
    }

    expect(turn.done).toBe(true);
    expect(isFinished(state)).toBe(true);
    expect(mainQuestionCount(state)).toBe(5);
    expect(state.evaluations).toHaveLength(5);
    expect(nextMainStep(state)).toEqual({ kind: "done" });
  });

  it("does not modify the state it was given", async () => {
    const state = newState();
    const turn = await runTurn(state, undefined, deps(fakeModel()));
    expect(state.questions).toHaveLength(0);
    expect(turn.state.questions).toHaveLength(1);
  });

  it("asks at most maxFollowUps follow-ups per main question", async () => {
    const generate = fakeModel({
      evaluation: { score: 1, followUp: { ask: true, question: "You said it just works. How?", quote: "it just works", reason: "vague" } },
    });
    let state = (await runTurn(newState({ mainQuestions: 5, maxFollowUps: 2 }), undefined, deps(generate))).state;

    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const turn = await runTurn(state, "Honestly it just works for me.", deps(generate));
      state = turn.state;
      ids.push(turn.nextQuestion?.id ?? "none");
    }
    // q1 -> two follow-ups -> q2 -> first follow-up of q2
    expect(ids).toEqual(["q1.1", "q1.2", "q2", "q2.1"]);
    expect(followUpCount(state, "q1")).toBe(2);
    expect(state.questions.find((q) => q.id === "q1.2")?.parentId).toBe("q1.1");
  });

  it("scores a skip as 0 without calling the model and asks no follow-up", async () => {
    const generate = fakeModel();
    const state = (await runTurn(newState(), undefined, deps(generate))).state;

    let evaluationCalls = 0;
    const counting: GenerateFn = async (args) => {
      if (args.prompt.includes("CANDIDATE'S ANSWER")) evaluationCalls += 1;
      return generate(args);
    };
    const turn = await runTurn(state, "I don't know", deps(counting));

    expect(evaluationCalls).toBe(0);
    expect(turn.evaluation).toMatchObject({ score: 0, skipped: true, missing: ["point A"] });
    expect(turn.nextQuestion?.isFollowUp).toBe(false);
  });

  it("removes a file path the model invented and reports it", async () => {
    // Force the deep-dive round by answering the first two questions.
    const generate = fakeModel({ question: { file: "src/does-not-exist.ts" } });
    let state = newState({ mainQuestions: 5 });
    let turn = await runTurn(state, undefined, deps(generate));
    for (let i = 0; i < 2; i++) turn = await runTurn(turn.state, "A full answer with details.", deps(generate));
    state = turn.state;

    const deepDive = turn.nextQuestion!;
    expect(deepDive.round).toBe("deep-dive");
    expect(deepDive.filesRead).toEqual(["src/auth.ts"]); // the hook's real file, not the invented one
    expect(turn.quality.at(-1)).toMatchObject({ inventedPathDropped: true, questionNamesRealFile: false });
  });

  it("ending early drops the unanswered question and finishes", async () => {
    const state = (await runTurn(newState(), undefined, deps(fakeModel()))).state;
    const ended = endEarly(state);
    expect(ended.questions).toHaveLength(0);
    expect(isFinished(ended)).toBe(true);
  });
});

describe("answer checks", () => {
  it("recognises skips and I-don't-know answers", () => {
    for (const answer of ["", "  ", "skip", "I don't know", "i dont know.", "No idea", "pass"]) expect(isSkip(answer), answer).toBe(true);
    expect(isSkip("I don't know the exact number, but it uses a hash map")).toBe(false);
  });

  it("checks that a follow-up quotes the real answer", () => {
    const answer = "I used   JWT because it is Stateless and easy.";
    expect(quoteAppearsInAnswer("because it is stateless", answer)).toBe(true);
    expect(quoteAppearsInAnswer('"jwt because it is stateless."', answer)).toBe(true);
    expect(quoteAppearsInAnswer("because sessions are slow", answer)).toBe(false);
    expect(quoteAppearsInAnswer("jwt", answer)).toBe(false); // too short to prove anything
    expect(quoteAppearsInAnswer(null, answer)).toBe(false);
  });
});

describe("report", () => {
  it("averages and labels readiness", () => {
    expect(averageScore([4, 3, 2])).toBe(3);
    expect(averageScore([])).toBe(0);
    expect(readinessLabel(0, 0)).toBe("Not enough answers to judge");
    expect(readinessLabel(1.2, 5)).toBe("Not ready yet");
    expect(readinessLabel(2, 5)).toBe("Getting there");
    expect(readinessLabel(3, 5)).toBe("Nearly ready");
    expect(readinessLabel(3.5, 5)).toBe("Interview ready");
  });

  it("leaves failed evaluations out of the average", async () => {
    const state = (await runTurn(newState(), undefined, deps(fakeModel()))).state;
    state.answers.push({ questionId: "q1", text: "x", skipped: false });
    state.evaluations.push({ questionId: "q1", answerSummary: "", score: 0, good: [], missing: [], followUp: { ask: false, reason: "" }, evaluated: false, skipped: false });
    expect(computeStats(state).readiness).toBe("Not enough answers to judge");
  });

  it("builds a report with computed scores and at most 5 next questions, and exports Markdown", async () => {
    const generate = fakeModel();
    let turn = await runTurn(newState({ mainQuestions: 5 }), undefined, deps(generate));
    for (let i = 0; i < 5; i++) turn = await runTurn(turn.state, "A specific answer.", deps(generate));

    const { report } = await buildReport(turn.state, { generate, today: "2026-10-04" });
    expect(report.overall).toBe(3);
    expect(report.readiness).toBe("Nearly ready");
    expect(report.perQuestion).toHaveLength(5);
    expect(report.likelyNextQuestions).toHaveLength(5);
    expect(report.weakSpots[0]).toEqual({ topic: "t", evidence: "e", lastScore: 3, sessionDate: "2026-10-04" });

    const markdown = reportToMarkdown(report, "repo");
    expect(markdown).toContain("# Viva report: repo");
    expect(markdown).toContain("**Overall:** 3/4");
    expect(markdown).toContain("### q1 · overview · 3/4");
  });
});
