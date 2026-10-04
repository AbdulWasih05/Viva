/**
 * Terminal interview: the whole Viva loop without a UI.
 *
 *   pnpm interview portfolio-new                      (a fixture)
 *   pnpm interview https://github.com/owner/repo tough 6
 *   pnpm interview ./my-project friendly              (needs LOCAL_MODE=true)
 *
 *   pnpm interview portfolio-new --forget             (clear what Viva remembers about this project)
 *
 * Type your answer and press Enter. "skip" skips a question, "end" finishes early.
 * In local mode (LOCAL_MODE=true) the weak spots are remembered and retested next time.
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createBrief } from "../src/lib/interview/brief";
import { buildReport, reportToMarkdown, weakSpotsToRemember } from "../src/lib/interview/report";
import { PersonaSchema } from "../src/lib/interview/schemas";
import { createInterviewState, progress } from "../src/lib/interview/state";
import { endEarly, runTurn } from "../src/lib/interview/turn";
import { addAiHooks, aiWrittenAreas, loadProvenance } from "../src/lib/provenance";
import { createAgentDeps } from "../src/mastra/deps";
import { forgetProject, memoryStatus, recallWeakSpots, saveWeakSpots } from "../src/mastra/memory";
import { loadSource } from "./load-source";

async function main() {
  const [target, personaArg, countArg] = process.argv.slice(2);
  if (!target) {
    console.log("Usage: pnpm interview <fixture | github url | folder> [friendly|tough] [5-12]");
    process.exit(1);
  }
  const persona = PersonaSchema.catch("tough").parse(personaArg);
  const mainQuestions = Number(countArg ?? 6);

  console.log(`Reading ${target} ...`);
  const source = await loadSource(target);

  if (personaArg === "--forget") {
    console.log((await forgetProject(source.id)) ? "Forgotten: Viva no longer remembers anything about this project." : "Nothing was remembered about this project.");
    return;
  }

  console.log(memoryStatus().label);
  const previousWeakSpots = await recallWeakSpots(source.id);
  if (previousWeakSpots.length > 0) console.log(`Last time's weak spots: ${previousWeakSpots.map((spot) => spot.topic).join("; ")}`);
  const briefResult = await createBrief(source);
  const { filesUsed, inventedPathsDropped, meta } = briefResult;

  // Entire checkpoints: which files did an AI agent write, and from which prompt?
  const { provenance, checkpointCount, hint } = await loadProvenance(source);
  const brief = addAiHooks(briefResult.brief, provenance);
  const areas = aiWrittenAreas(provenance);
  if (hint) console.log(`\n${hint}`);
  else console.log(`\nAI-written areas (${checkpointCount} Entire checkpoints, ${areas.length} files): ${areas.slice(0, 8).map((area) => area.path).join(", ")}${areas.length > 8 ? ", ..." : ""}`);
  console.log(`\nRead ${filesUsed.length} of ${source.files.length} files in ${meta.ms} ms${meta.usedFallback ? " (model failed, fallback brief)" : ""}.`);
  console.log(`Invented paths dropped: ${inventedPathsDropped}`);
  console.log(`\n${brief.summary}\nStack: ${brief.stack.join(", ")}`);
  console.log(`Hooks:\n${brief.hooks.map((hook) => `  - (${hook.kind}) ${hook.ref}${hook.file ? ` [${hook.file}]` : ""}`).join("\n")}`);

  // Read answers line by line. Using the line iterator (instead of io.question) also works when
  // answers are piped in from a file; when the input runs out, the interview ends early.
  const io = createInterface({ input: process.stdin });
  const lines = io[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? "end" : next.value;
  };

  const correction = (await ask("\nAnything to correct about this brief? (Enter to skip) ")).trim();

  let state = createInterviewState({
    repoId: source.id,
    repoLabel: source.label,
    filePaths: source.files.map((file) => file.path),
    brief,
    userCorrection: correction || undefined,
    provenance,
    previousWeakSpots,
    settings: { persona, mainQuestions },
  });
  // The Mastra interviewer agent writes the code questions and opens files with its tools.
  const deps = createAgentDeps(source, state.settings, provenance);

  let turn = await runTurn(state, undefined, deps);
  while (turn.nextQuestion) {
    state = turn.state;
    const { asked, total } = progress(state);
    const question = turn.nextQuestion;
    for (const activity of turn.toolActivity) console.log(`  (${activity})`);
    console.log(`\n[${question.round} · ${asked}/${total}${question.isFollowUp ? " · follow-up" : ""}${question.aboutAiCode ? " · AI-written code" : ""}] ${question.text}`);

    const answer = await ask("> ");
    if (answer.trim().toLowerCase() === "end") {
      state = endEarly(state);
      break;
    }
    turn = await runTurn(state, answer, deps);
    state = turn.state;
    if (turn.evaluation) console.log(`  score ${turn.evaluation.score}/4${turn.evaluation.skipped ? " (skipped)" : ""}`);
  }
  io.close();

  console.log("\nWriting the report ...");
  const { report } = await buildReport(state);
  const markdown = reportToMarkdown(report, source.label);
  writeFileSync("viva-report.md", markdown);
  console.log(`\n${markdown}\n\nSaved to viva-report.md`);

  const today = new Date().toISOString().slice(0, 10);
  if (await saveWeakSpots(source.id, weakSpotsToRemember(report, today))) console.log("Weak spots saved for next time (on this computer only).");
}

main();
