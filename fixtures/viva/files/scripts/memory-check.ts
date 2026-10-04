/**
 * Phase 2 memory check: does a second session open by retesting the first session's weak spots?
 *
 *   pnpm tsx --env-file=.env scripts/memory-check.ts [tries]
 *
 * Each try: forget the project, run a short first session with weak answers, save its weak spots,
 * then start a second session and look at its first question.
 * Uses its own database file so it never touches real memory.
 */
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.LOCAL_MODE = "true";
process.env.MEMORY_DB_PATH = path.join(mkdtempSync(path.join(os.tmpdir(), "viva-memory-check-")), "memory.db");

import { loadFixture } from "../src/lib/ingest/fixture";
import { ProjectBriefSchema } from "../src/lib/interview/schemas";
import { buildReport, weakSpotsToRemember } from "../src/lib/interview/report";
import { createInterviewState } from "../src/lib/interview/state";
import { runTurn } from "../src/lib/interview/turn";
import { forgetProject, recallWeakSpots, saveWeakSpots } from "../src/mastra/memory";
import { readFileSync } from "node:fs";

const WEAK_ANSWER = "I am not really sure how that part works, I think the framework handles it for me.";

async function main() {
  const tries = Number(process.argv[2] ?? 3);
  const source = loadFixture("portfolio-new");
  // The brief saved by the last eval run, so this check spends its tokens on the sessions only.
  const brief = ProjectBriefSchema.parse(JSON.parse(readFileSync("fixtures/briefs/portfolio-new.json", "utf8")));
  const base = { repoId: source.id, repoLabel: source.label, filePaths: source.files.map((file) => file.path), brief };
  const deps = { readFile: source.readFile };
  let passed = 0;

  for (let attempt = 1; attempt <= tries; attempt++) {
    await forgetProject(source.id);

    // Session 1: weak answers, no follow-ups (keeps the check short).
    let turn = await runTurn(createInterviewState({ ...base, settings: { mainQuestions: 5, maxFollowUps: 0 } }), undefined, deps);
    while (turn.nextQuestion) turn = await runTurn(turn.state, WEAK_ANSWER, deps);
    const { report } = await buildReport(turn.state);
    const toSave = weakSpotsToRemember(report, new Date().toISOString().slice(0, 10));
    await saveWeakSpots(source.id, toSave);

    // Session 2: a fresh state built only from what memory returns.
    const recalled = await recallWeakSpots(source.id);
    const second = await runTurn(createInterviewState({ ...base, previousWeakSpots: recalled, settings: { mainQuestions: 5 } }), undefined, deps);
    const first = second.nextQuestion;
    const topic = recalled[0]?.topic;
    const ok = Boolean(topic) && first?.round === "retest" && first.text.startsWith(`Last time you struggled with "${topic}". Let's start there.`);
    if (ok) passed += 1;

    console.log(`try ${attempt}: ${ok ? "PASS" : "FAIL"} (session 1 overall ${report.overall}/4, ${toSave.length} weak spots saved, ${recalled.length} recalled)`);
    console.log(`  session 2 opens with: ${first?.text}`);
  }
  console.log(`\nsecond session opened with last session's weak spot: ${passed} of ${tries}`);
}

main();
