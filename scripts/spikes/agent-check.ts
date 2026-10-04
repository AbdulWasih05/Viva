/**
 * Phase 2 check: does the interviewer agent open a file with its tool and then return a valid question?
 *
 *   pnpm tsx --env-file=.env scripts/spikes/agent-check.ts [runs]
 */
import { loadFixture } from "../../src/lib/ingest/fixture";
import { QuestionDraftSchema } from "../../src/lib/interview/schemas";
import { createRepoContext } from "../../src/mastra/context";
import { interviewerGenerate } from "../../src/mastra/generate";

async function main() {
  const runs = Number(process.argv[2] ?? 3);
  const source = loadFixture("portfolio-new");
  const filePaths = source.files.map((file) => file.path).filter((path) => path.startsWith("src/") || !path.includes("/"));

  for (let i = 0; i < runs; i++) {
    const repo = createRepoContext({ filePaths, readFile: source.readFile });
    const generate = interviewerGenerate({ repo, persona: "tough", targetRole: "Frontend engineer" });
    const start = Date.now();
    try {
      const res = await generate({
        instructions: "",
        schema: QuestionDraftSchema,
        prompt: [
          "REAL FILE PATHS:",
          filePaths.join("\n"),
          "",
          "THIS QUESTION'S ROUND: deep-dive. Ask how a specific piece of the code works. Name the file.",
          "Open the file with readFile before you write the question.",
          "Write: text (the question), file (the path it is about), rubric { mustMention, goodSignals, redFlags }.",
        ].join("\n"),
      });
      const parsed = QuestionDraftSchema.safeParse(res.object);
      console.log(
        `run ${i + 1}: ${Date.now() - start} ms, valid=${parsed.success}, filesRead=${JSON.stringify(repo.filesRead)}, activity=${JSON.stringify(repo.activity)}`,
      );
      if (parsed.success) console.log(`  file=${parsed.data.file}\n  Q: ${parsed.data.text}`);
      else console.log(`  raw: ${JSON.stringify(res.object).slice(0, 300)}`);
    } catch (err) {
      console.log(`run ${i + 1}: ${Date.now() - start} ms, ERROR ${err instanceof Error ? err.message.slice(0, 300) : err}`);
    }
  }
}

main();
