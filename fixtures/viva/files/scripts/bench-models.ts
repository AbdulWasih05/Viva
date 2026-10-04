/**
 * Phase 0.7 model benchmark: the same two prompts on hosted Gemma and on local Gemma.
 *
 *   pnpm bench hosted 5     (needs HOSTED_API_KEY in .env)
 *   pnpm bench ollama 3     (needs Ollama running with OLLAMA_MODEL pulled)
 *
 * Measures, per prompt:
 *   - validity:  did the output parse against the zod schema?
 *   - real-file: do the file paths the model names exist in the repo? (it must not invent files)
 *   - latency:   wall-clock time per call
 *
 * The input is a small fixture so the local model can finish in reasonable time.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";

const provider = process.argv[2] === "ollama" ? "ollama" : "hosted";
const runs = Number(process.argv[3] ?? (provider === "hosted" ? 5 : 3));

const model =
  provider === "hosted"
    ? {
        id: `google/${process.env.HOSTED_MODEL ?? "gemma-4-26b-a4b-it"}` as const,
        apiKey: process.env.HOSTED_API_KEY,
      }
    : {
        id: `ollama/${process.env.OLLAMA_MODEL ?? "gemma4:e4b"}` as const,
        url: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      };

// Hosted calls should answer in seconds; a silent hang is cut off. Local CPU inference needs minutes.
const CALL_TIMEOUT_MS = provider === "hosted" ? 30_000 : 900_000;
const providerOptions = { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } };

// ---- fixture input -------------------------------------------------------------------------

const fixtureDir = path.resolve(process.cwd(), "fixtures/portfolio-new");

// FILES.tsv has one "<bytes>\t<path>" line per tracked file. Keep source paths only.
const filePaths = readFileSync(path.join(fixtureDir, "FILES.tsv"), "utf8")
  .split("\n")
  .map((line) => line.split("\t")[1]?.trim())
  .filter((p): p is string => Boolean(p))
  .filter((p) => !p.startsWith("public/") && !/\.(webp|png|jpg|lockb)$/.test(p) && p !== "package-lock.json");

const readme = readFileSync(path.join(fixtureDir, "files/README.md"), "utf8");
const packageJson = readFileSync(path.join(fixtureDir, "files/package.json"), "utf8");

const context = [
  "FILES IN THE REPO:",
  filePaths.join("\n"),
  "",
  "README.md:",
  readme,
  "",
  "package.json:",
  packageJson,
].join("\n");

// ---- the two prompts -----------------------------------------------------------------------

const Brief = z.object({
  summary: z.string().min(1),
  stack: z.array(z.string()).min(1),
  hooks: z.array(z.object({ file: z.string(), why: z.string() })).min(1),
});

const DeepDive = z.object({
  question: z.string().min(1),
  file: z.string(),
});

type Result = { valid: boolean; named: number; real: number; ms: number; error?: string };

const agent = new Agent({
  id: "bench",
  name: "Bench",
  instructions: "You are a technical interviewer preparing to question a student about their own project.",
  model,
});

async function runBrief(): Promise<Result> {
  const start = Date.now();
  const res = await agent.generate(
    `${context}\n\nWrite a project brief: a 2 sentence summary, the tech stack, and 3 interview hooks. ` +
      `Each hook must name one file path copied exactly from FILES IN THE REPO and say why it is worth asking about.`,
    {
      providerOptions,
      structuredOutput: { schema: Brief, jsonPromptInjection: true },
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  );
  const parsed = Brief.safeParse(res.object);
  const files = parsed.success ? parsed.data.hooks.map((h) => h.file) : [];
  return {
    valid: parsed.success,
    named: files.length,
    real: files.filter((f) => filePaths.includes(f)).length,
    ms: Date.now() - start,
  };
}

async function runQuestion(): Promise<Result> {
  const start = Date.now();
  const res = await agent.generate(
    `${context}\n\nAsk one deep-dive interview question about a design decision in this project. ` +
      `Name the one file it is about, copied exactly from FILES IN THE REPO.`,
    {
      providerOptions,
      structuredOutput: { schema: DeepDive, jsonPromptInjection: true },
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    },
  );
  const parsed = DeepDive.safeParse(res.object);
  return {
    valid: parsed.success,
    named: parsed.success ? 1 : 0,
    real: parsed.success && filePaths.includes(parsed.data.file) ? 1 : 0,
    ms: Date.now() - start,
  };
}

// ---- runner --------------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function bench(name: string, run: () => Promise<Result>) {
  const results: Result[] = [];
  for (let i = 0; i < runs; i++) {
    const start = Date.now();
    try {
      results.push(await run());
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 120) : String(err);
      results.push({ valid: false, named: 0, real: 0, ms: Date.now() - start, error: message });
    }
  }
  const valid = results.filter((r) => r.valid).length;
  const named = results.reduce((sum, r) => sum + r.named, 0);
  const real = results.reduce((sum, r) => sum + r.real, 0);
  console.log(
    `${name}: valid ${valid}/${runs}, real files ${real}/${named} named, ` +
      `median ${median(results.map((r) => r.ms))} ms, runs [${results.map((r) => r.ms).join(", ")}] ms`,
  );
  for (const e of new Set(results.map((r) => r.error).filter(Boolean))) console.log(`  error: ${e}`);
}

async function main() {
  console.log(`provider=${provider} model=${model.id} runs=${runs} context=${context.length} chars, ${filePaths.length} files`);
  await bench("brief", runBrief);
  await bench("question", runQuestion);
}

main();
