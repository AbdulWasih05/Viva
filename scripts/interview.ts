/**
 * Terminal interview: the whole Viva loop without a UI.
 *
 *   pnpm interview portfolio-new                      (a fixture)
 *   pnpm interview https://github.com/owner/repo tough 6
 *   pnpm interview ./my-project friendly              (needs LOCAL_MODE=true)
 *
 * Type your answer and press Enter. "skip" skips a question, "end" finishes early.
 */
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createBrief } from "../src/lib/interview/brief";
import { buildReport, reportToMarkdown } from "../src/lib/interview/report";
import { PersonaSchema } from "../src/lib/interview/schemas";
import { createInterviewState, progress } from "../src/lib/interview/state";
import { endEarly, runTurn } from "../src/lib/interview/turn";
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
  const { brief, filesUsed, inventedPathsDropped, meta } = await createBrief(source);
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
    settings: { persona, mainQuestions },
  });
  const deps = { readFile: source.readFile };

  let turn = await runTurn(state, undefined, deps);
  while (turn.nextQuestion) {
    state = turn.state;
    const { asked, total } = progress(state);
    const question = turn.nextQuestion;
    for (const activity of turn.toolActivity) console.log(`  (${activity})`);
    console.log(`\n[${question.round} · ${asked}/${total}${question.isFollowUp ? " · follow-up" : ""}] ${question.text}`);

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
}

main();
