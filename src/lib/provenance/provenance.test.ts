import { describe, expect, it } from "vitest";
import { loadFixture } from "../ingest/fixture";
import { isSourceFile } from "../ingest/select";
import type { GenerateFn } from "../llm/structured";
import type { ProjectBrief, QuestionDraft } from "../interview/schemas";
import { createInterviewState } from "../interview/state";
import { runTurn } from "../interview/turn";
import { NO_CHECKPOINTS_HINT, addAiHooks, loadProvenance, provenanceFromInput } from "./index";
import {
  aiWrittenAreas,
  buildProvenance,
  checkpointIdFromMessage,
  cleanPrompt,
  parseCheckpointInfo,
  parseUserPrompts,
  pickPrompt,
  summarizePrompt,
  type ProvenanceInput,
} from "./parse";

describe("commit trailer", () => {
  it("finds the checkpoint id", () => {
    expect(checkpointIdFromMessage("feat: add auth\n\nbody\n\nEntire-Checkpoint: 01M42JD451BYV1GWSZGCGR7XW8\n")).toBe("01M42JD451BYV1GWSZGCGR7XW8");
  });
  it("returns null for an ordinary commit", () => {
    expect(checkpointIdFromMessage("fix: typo\n\nMentions Entire-Checkpoint in prose only.")).toBeNull();
  });
});

describe("checkpoint metadata", () => {
  it("reads the fields we use and tolerates missing ones", () => {
    const session = JSON.stringify({ session_id: "s1", created_at: "2026-10-04T04:23:01Z", files_touched: ["a.ts"], initial_attribution: { agent_lines: 12, agent_percentage: 80 } });
    expect(parseCheckpointInfo("C1", "{}", session)).toEqual({ id: "C1", sessionId: "s1", createdAt: "2026-10-04T04:23:01Z", filesTouched: ["a.ts"], agentLines: 12, agentPercentage: 80 });
    expect(parseCheckpointInfo("C2", null, "{}")).toMatchObject({ filesTouched: [], agentLines: 0 });
    expect(parseCheckpointInfo("C3", "not json", null)).toBeNull();
  });
});

describe("prompts", () => {
  it("keeps what a person typed and drops machine-made messages", () => {
    expect(cleanPrompt("add JWT auth with refresh tokens")).toBe("add JWT auth with refresh tokens");
    expect(cleanPrompt('<pasted_content id="9afb">\nRead the docs and start Phase 0.\n</pasted_content id="9afb">')).toBe("Read the docs and start Phase 0.");
    expect(cleanPrompt("<task-notification><task-id>b8</task-id></task-notification>")).toBeNull();
    expect(cleanPrompt("[Request interrupted by user]")).toBeNull();
    expect(cleanPrompt("continue")).toBeNull();
  });

  it("parses the compact transcript, skipping assistant lines and broken lines", () => {
    const transcript = [
      JSON.stringify({ v: 1, type: "user", ts: "2026-10-03T17:31:38Z", content: [{ text: "build the ingest module first" }] }),
      JSON.stringify({ v: 1, type: "assistant", ts: "2026-10-03T17:31:40Z", content: [{ text: 'mentions "type":"user" inside text' }] }),
      JSON.stringify({ v: 1, type: "user", ts: "2026-10-03T17:34:25Z", content: [{ text: "<task-notification>done</task-notification>" }] }),
      '{"type":"user", broken',
    ].join("\n");
    expect(parseUserPrompts(transcript)).toEqual([{ ts: "2026-10-03T17:31:38Z", text: "build the ingest module first" }]);
  });

  it("picks the first prompt after the previous checkpoint, else the latest earlier one", () => {
    const prompts = [
      { ts: "2026-10-03T10:00:00Z", text: "first task" },
      { ts: "2026-10-03T12:00:00Z", text: "second task" },
      { ts: "2026-10-03T12:30:00Z", text: "small correction" },
    ];
    expect(pickPrompt(prompts, "2026-10-03T11:00:00Z", "2026-10-03T13:00:00Z")?.text).toBe("second task");
    expect(pickPrompt(prompts, "2026-10-03T13:00:00Z", "2026-10-03T14:00:00Z")?.text).toBe("small correction");
    expect(pickPrompt(prompts, "", "2026-10-03T09:00:00Z")).toBeUndefined();
  });

  it("summarises to one line of at most 160 characters", () => {
    expect(summarizePrompt("add\n  auth\tnow")).toBe("add auth now");
    expect(summarizePrompt("x".repeat(300))).toHaveLength(160);
  });
});

const INPUT: ProvenanceInput = {
  checkpoints: [
    { id: "C1", sessionId: "s1", createdAt: "2026-10-03T11:00:00Z", filesTouched: [], agentLines: 0, agentPercentage: 0 },
    { id: "C2", sessionId: "s1", createdAt: "2026-10-03T13:00:00Z", filesTouched: ["src/auth.ts"], agentLines: 40, agentPercentage: 90 },
  ],
  commits: [
    { sha: "bbbbbbbbbbbb", checkpointId: "C2", files: ["src/auth.ts", "src/db.ts", "README.md"] },
    { sha: "aaaaaaaaaaaa", checkpointId: "C1", files: ["src/db.ts", "src/deleted.ts", "src/app.test.ts"] },
    { sha: "cccccccccccc", checkpointId: "UNKNOWN", files: ["src/db.ts"] },
  ],
  promptsBySession: {
    s1: [
      { ts: "2026-10-03T10:00:00Z", text: "set up the database layer" },
      { ts: "2026-10-03T12:00:00Z", text: "add JWT auth with refresh tokens" },
    ],
  },
};
const FILES = ["README.md", "src/auth.ts", "src/db.ts", "src/app.test.ts"];

describe("buildProvenance", () => {
  const entries = buildProvenance(INPUT, FILES, isSourceFile);

  it("uses Entire's file list when it has attribution, and the whole commit otherwise", () => {
    expect(entries).toEqual([
      // C2 has attribution: only the file Entire says the agent touched.
      { path: "src/auth.ts", commit: "bbbbbbb", checkpointId: "C2", promptSummary: "add JWT auth with refresh tokens", scope: "file", source: "attribution" },
      // C1 has none: every source file in the commit that still exists (no deleted file, no test).
      { path: "src/db.ts", commit: "aaaaaaa", checkpointId: "C1", promptSummary: "set up the database layer", scope: "file", source: "commit" },
    ]);
  });

  it("lists each AI-written file once", () => {
    expect(aiWrittenAreas([...entries, ...entries]).map((area) => area.path)).toEqual(["src/auth.ts", "src/db.ts"]);
  });
});

describe("no checkpoints", () => {
  it("gives an empty result and a hint, without throwing", async () => {
    const result = provenanceFromInput({ checkpoints: [], commits: [], promptsBySession: {} }, FILES);
    expect(result).toEqual({ provenance: [], checkpointCount: 0, hint: NO_CHECKPOINTS_HINT });
    // A fixture without checkpoint data takes the same quiet path.
    expect((await loadProvenance(loadFixture("portfolio-new"))).provenance).toEqual([]);
  });
});

const BRIEF: ProjectBrief = {
  summary: "s",
  stack: [],
  components: [],
  decisions: [],
  risks: [],
  hooks: [
    { id: "h1", kind: "file", ref: "db layer", file: "src/db.ts", why: "w" },
    { id: "h2", kind: "decision", ref: "choice", file: null, why: "w" },
    { id: "h3", kind: "risk", ref: "risk", file: null, why: "w" },
  ],
};

describe("AI-authored hooks and questions", () => {
  const provenance = buildProvenance(INPUT, FILES, isSourceFile);

  it("adds ai-authored hooks, files the brief already mentions first", () => {
    const brief = addAiHooks(BRIEF, provenance);
    const ai = brief.hooks.filter((hook) => hook.kind === "ai-authored");
    expect(ai.map((hook) => hook.file)).toEqual(["src/db.ts", "src/auth.ts"]);
    expect(ai[0].why).toContain("set up the database layer");
    expect(addAiHooks(BRIEF, [])).toBe(BRIEF);
  });

  it("the deep-dive question about AI-written code says so and quotes the session's prompt", async () => {
    const generate: GenerateFn = async ({ prompt }) => {
      if (prompt.includes("CANDIDATE'S ANSWER")) {
        return { object: { answerSummary: "s", score: 3, good: [], missing: [], followUp: { ask: false, question: null, quote: null, reason: null } } };
      }
      const draft: QuestionDraft = { text: "How does the connection pool work?", file: "src/db.ts", rubric: { mustMention: [], goodSignals: [], redFlags: [] } };
      return { object: draft };
    };
    const deps = { generate, readFile: async () => "code" };
    const state = createInterviewState({ repoId: "r", repoLabel: "r", filePaths: FILES, brief: addAiHooks(BRIEF, provenance), provenance, settings: { mainQuestions: 5 } });

    let turn = await runTurn(state, undefined, deps); // overview
    turn = await runTurn(turn.state, "A full answer.", deps); // decisions
    turn = await runTurn(turn.state, "A full answer.", deps); // deep-dive

    expect(turn.nextQuestion).toMatchObject({ round: "deep-dive", aboutAiCode: true, hookId: "ai1" });
    expect(turn.nextQuestion?.text).toBe(
      'Your Entire session shows an AI agent wrote src/db.ts (the prompt was: "set up the database layer"). How does the connection pool work?',
    );
    expect(turn.quality.at(-1)?.aiAuthoredQuestion).toBe(true);
  });
});

describe("dogfood fixture (this repo)", () => {
  it("has checkpoint data that yields AI-written source files with real prompts", async () => {
    const source = loadFixture("viva");
    const { provenance, checkpointCount, hint } = await loadProvenance(source);
    expect(checkpointCount).toBeGreaterThan(0);
    expect(hint).toBeNull();
    expect(provenance.length).toBeGreaterThan(0);
    const paths = new Set(source.files.map((file) => file.path));
    for (const entry of provenance) {
      expect(paths.has(entry.path)).toBe(true);
      expect(isSourceFile(entry.path)).toBe(true);
      expect(entry.promptSummary.startsWith("<")).toBe(false);
    }
  });
});
