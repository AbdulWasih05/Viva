import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GenerateFn } from "../lib/llm/structured";
import { buildReport, progressVsLast, weakSpotsToRemember } from "../lib/interview/report";
import type { ProjectBrief, QuestionDraft, Report, WeakSpot } from "../lib/interview/schemas";
import { createInterviewState } from "../lib/interview/state";
import { runTurn, type TurnDeps } from "../lib/interview/turn";
import { createRepoContext, createRequestContext } from "./context";
import { forgetProject, memoryStatus, recallWeakSpots, saveWeakSpots, threadIdFor } from "./memory";
import { getProvenance, listFiles, readFile } from "./tools/repo";

const FILES = ["README.md", "src/auth.ts", "src/db.ts"];
const BRIEF: ProjectBrief = {
  summary: "A demo API.",
  stack: ["TypeScript"],
  components: [],
  decisions: [],
  risks: [],
  hooks: [
    { id: "h1", kind: "decision", ref: "JWT", file: null, why: "w" },
    { id: "h2", kind: "file", ref: "auth flow", file: "src/auth.ts", why: "w" },
    { id: "h3", kind: "risk", ref: "no rate limit", file: null, why: "w" },
  ],
};
const WEAK: WeakSpot[] = [
  { topic: "JWT refresh flow", evidence: "could not explain rotation", lastScore: 1, sessionDate: "2026-10-03" },
  { topic: "Database indexes", evidence: "vague", lastScore: 2, sessionDate: "2026-10-03" },
  { topic: "Caching", evidence: "vague", lastScore: 1, sessionDate: "2026-10-03" },
];

function toolContext() {
  const repo = createRepoContext({
    filePaths: FILES,
    readFile: async (p) => `line1 of ${p}\nline2\nline3`,
    provenance: [{ path: "src/auth.ts", commit: "abc1234", checkpointId: "c1", promptSummary: "add JWT auth", scope: "file" }],
  });
  return { repo, context: { requestContext: createRequestContext({ repo, persona: "tough", targetRole: "SDE" }) } };
}

// Tools are called here the way Mastra calls them: (input, context).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: the tool context type is internal to Mastra
const run = (tool: { execute?: (...args: any[]) => unknown }, input: unknown, context: unknown) => tool.execute!(input, context) as Promise<any>;

describe("repo tools", () => {
  it("readFile returns real files and records what was read", async () => {
    const { repo, context } = toolContext();
    const result = await run(readFile, { path: "./src/auth.ts", startLine: 2, endLine: 3 }, context);
    expect(result).toMatchObject({ found: true, path: "src/auth.ts", content: "line2\nline3" });
    expect(repo.filesRead).toEqual(["src/auth.ts"]);
    expect(repo.activity).toEqual(["reading src/auth.ts"]);
  });

  it("readFile refuses a path the model invented", async () => {
    const { repo, context } = toolContext();
    const result = await run(readFile, { path: "src/payments.ts" }, context);
    expect(result.found).toBe(false);
    expect(result.content).toBe("");
    expect(repo.filesRead).toEqual([]);
  });

  it("listFiles filters by folder", async () => {
    const { context } = toolContext();
    expect((await run(listFiles, { folder: "src" }, context)).paths).toEqual(["src/auth.ts", "src/db.ts"]);
    expect((await run(listFiles, {}, context)).paths).toHaveLength(3);
  });

  it("getProvenance says whether a file was AI-written and from which prompt", async () => {
    const { context } = toolContext();
    expect(await run(getProvenance, { path: "src/auth.ts" }, context)).toEqual({ aiAuthored: true, entries: [{ commit: "abc1234", promptSummary: "add JWT auth" }] });
    expect((await run(getProvenance, { path: "src/db.ts" }, context)).aiAuthored).toBe(false);
  });
});

/** A fake model for question, evaluation and report prompts. */
const fakeModel =
  (score = 3): GenerateFn =>
  async ({ prompt }) => {
    if (prompt.includes("CANDIDATE'S ANSWER")) {
      return { object: { answerSummary: "s", score, good: [], missing: [], followUp: { ask: false, question: null, quote: null, reason: null } } };
    }
    if (prompt.includes("EVALUATED TRANSCRIPT")) {
      return { object: { strengths: [], weakSpots: [{ topic: "Error handling", evidence: "none shown" }], revisionList: [], likelyNextQuestions: [] } };
    }
    const draft: QuestionDraft = { text: "How does it work?", file: null, rubric: { mustMention: [], goodSignals: [], redFlags: [] } };
    return { object: draft };
  };

describe("agent in the turn", () => {
  it("uses the agent for code rounds only, and reports the files it opened", async () => {
    const calls: string[] = [];
    const deps: TurnDeps = {
      readFile: async () => "code",
      generate: async (args) => (calls.push("plain"), fakeModel()(args)),
      agent: {
        generate: async (args) => (calls.push("agent"), fakeModel()(args)),
        takeFilesRead: () => ["src/db.ts"],
        takeActivity: () => ["reading src/db.ts"],
      },
    };
    let turn = await runTurn(createInterviewState({ repoId: "r", repoLabel: "r", filePaths: FILES, brief: BRIEF, settings: { mainQuestions: 5 } }), undefined, deps);
    expect(calls).toEqual(["plain"]); // overview: no tools
    calls.length = 0;

    turn = await runTurn(turn.state, "A full answer.", deps); // -> decisions question
    expect(calls).toEqual(["plain", "agent"]); // evaluation, then the agent writes the question
    expect(turn.nextQuestion?.round).toBe("decisions");
    expect(turn.nextQuestion?.filesRead).toEqual(["src/db.ts"]);
    expect(turn.toolActivity).toEqual(["reading src/db.ts"]);
  });
});

describe("returning session", () => {
  const deps: TurnDeps = { readFile: async () => "code", generate: fakeModel(3) };
  const start = () => createInterviewState({ repoId: "r", repoLabel: "r", filePaths: FILES, brief: BRIEF, previousWeakSpots: WEAK, settings: { mainQuestions: 5 } });

  it("opens with at most two retest questions, with the 'last time' sentence written by code", async () => {
    const state = start();
    expect(state.roundPlan.slice(0, 3)).toEqual(["retest", "retest", "overview"]);
    expect(state.roundPlan).toHaveLength(7);

    let turn = await runTurn(state, undefined, deps);
    expect(turn.nextQuestion).toMatchObject({ round: "retest", retestTopic: "JWT refresh flow" });
    expect(turn.nextQuestion?.text).toBe('Last time you struggled with "JWT refresh flow". Let\'s start there. How does it work?');

    turn = await runTurn(turn.state, "An answer.", deps);
    expect(turn.nextQuestion?.text.startsWith('You also struggled with "Database indexes" last time.')).toBe(true);

    turn = await runTurn(turn.state, "An answer.", deps);
    expect(turn.nextQuestion).toMatchObject({ round: "overview" });
    expect(turn.nextQuestion?.retestTopic).toBeUndefined();
  });

  it("a first session has no retest questions", () => {
    const state = createInterviewState({ repoId: "r", repoLabel: "r", filePaths: FILES, brief: BRIEF, settings: { mainQuestions: 5 } });
    expect(state.roundPlan[0]).toBe("overview");
  });

  it("reports progress on retested topics and decides what to remember", async () => {
    let turn = await runTurn(start(), undefined, deps);
    for (let i = 0; i < 7; i++) turn = await runTurn(turn.state, "An answer.", deps);
    expect(turn.done).toBe(true);

    expect(progressVsLast(turn.state)).toEqual([
      { topic: "JWT refresh flow", before: 1, after: 3 },
      { topic: "Database indexes", before: 2, after: 3 },
    ]);
    const { report } = await buildReport(turn.state, { generate: fakeModel(3), today: "2026-10-04" });
    // Both retested topics reached 3, so they are dropped; only the new weak spot is remembered.
    expect(weakSpotsToRemember(report, "2026-10-04").map((spot) => spot.topic)).toEqual(["Error handling"]);
  });

  it("keeps a retested topic that is still weak at the front of the list", () => {
    const report = {
      progressVsLast: [{ topic: "JWT refresh flow", before: 1, after: 2 }],
      weakSpots: [
        { topic: "jwt refresh flow", evidence: "e", lastScore: 2, sessionDate: "d" },
        { topic: "Caching", evidence: "e", lastScore: 2, sessionDate: "d" },
      ],
    } as Report;
    expect(weakSpotsToRemember(report, "2026-10-04")).toEqual([
      { topic: "JWT refresh flow", evidence: "Still weak when retested.", lastScore: 2, sessionDate: "2026-10-04" },
      { topic: "Caching", evidence: "e", lastScore: 2, sessionDate: "d" },
    ]);
  });
});

describe("memory", () => {
  const saved = { ...process.env };
  beforeAll(() => {
    process.env.MEMORY_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "viva-test-")), "memory.db");
  });
  afterAll(() => {
    process.env = saved;
  });

  it("makes a safe thread id from a repo id", () => {
    expect(threadIdFor("github:AbdulWasih05/Viva")).toBe("viva-github-abdulwasih05-viva");
  });

  it("hosted mode keeps nothing", async () => {
    process.env.LOCAL_MODE = "false";
    expect(memoryStatus().enabled).toBe(false);
    expect(await saveWeakSpots("github:a/b", WEAK)).toBe(false);
    expect(await recallWeakSpots("github:a/b")).toEqual([]);
  });

  it("local mode saves, recalls, overwrites and forgets per repo", async () => {
    process.env.LOCAL_MODE = "true";
    expect(await recallWeakSpots("github:a/b")).toEqual([]);

    await saveWeakSpots("github:a/b", WEAK);
    expect(await recallWeakSpots("github:a/b")).toEqual(WEAK);
    expect(await recallWeakSpots("github:a/other")).toEqual([]);

    await saveWeakSpots("github:a/b", WEAK.slice(0, 1));
    expect(await recallWeakSpots("github:a/b")).toEqual(WEAK.slice(0, 1));

    expect(await forgetProject("github:a/b")).toBe(true);
    expect(await recallWeakSpots("github:a/b")).toEqual([]);
    expect(await forgetProject("github:a/b")).toBe(false);
  });
});
