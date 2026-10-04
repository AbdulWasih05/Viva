/**
 * Phase 0.4 spike: can a Mastra agent drive Gemma for the three things Viva needs?
 *   1. plain generate with a system prompt
 *   2. a tool call (readFile stub)
 *   3. structured output validated by a zod schema
 *
 * Run:  pnpm tsx --env-file=.env scripts/spikes/mastra.ts hosted 5
 *       pnpm tsx --env-file=.env scripts/spikes/mastra.ts ollama 1
 *
 * Throwaway code. The real provider setup lands in src/lib/llm in Phase 1.
 */
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const provider = process.argv[2] === "ollama" ? "ollama" : "hosted";
const runs = Number(process.argv[3] ?? 5);

// Hosted: Mastra's model router talks to Google's native API ("google/<model>").
// Local: Ollama through its OpenAI-compatible endpoint.
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

// Gemma 4 "thinks" by default, which costs 10+ seconds per call. Minimal thinking keeps turns fast.
const providerOptions = { google: { thinkingConfig: { thinkingLevel: "minimal" as const } } };

// A hosted call that gets no answer would otherwise hang for 5 minutes (Node's default fetch timeout).
// Local Gemma on a CPU needs minutes, so it gets a much longer limit.
const CALL_TIMEOUT_MS = provider === "hosted" ? 30_000 : 900_000;

let toolCalls = 0;
const readFile = createTool({
  id: "readFile",
  description: "Read a file from the candidate's repository. Use it before asking about a file.",
  inputSchema: z.object({ path: z.string().describe("repo-relative file path") }),
  outputSchema: z.object({ content: z.string() }),
  execute: async (input) => {
    toolCalls += 1;
    return {
      content: `// ${input.path}\nexport function refresh(token: string) { return jwt.verify(token, SECRET); }`,
    };
  },
});

const agent = new Agent({
  id: "spike-interviewer",
  name: "Spike interviewer",
  instructions: "You are a terse technical interviewer. Ask exactly one question at a time.",
  model,
  tools: { readFile },
});

const Evaluation = z.object({
  score: z.number().int().min(0).max(4),
  good: z.array(z.string()),
  missing: z.array(z.string()),
});

type Check = { name: string; run: () => Promise<boolean> };

const checks: Check[] = [
  {
    name: "plain generate",
    run: async () => {
      const res = await agent.generate("Ask one short question about database indexes.", { providerOptions });
      return res.text.trim().length > 0 && !res.text.includes("<thought>");
    },
  },
  {
    name: "tool call (readFile)",
    run: async () => {
      const before = toolCalls;
      const res = await agent.generate("Open src/auth.ts with the readFile tool, then ask one question about its code.", {
        providerOptions,
      });
      return toolCalls > before && res.text.trim().length > 0;
    },
  },
  {
    name: "structured output (zod)",
    run: async () => {
      const res = await agent.generate(
        'Evaluate this interview answer on a 0 to 4 scale. Question: "Why JWT?" Answer: "Because it is stateless."',
        { providerOptions, structuredOutput: { schema: Evaluation }, abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS) },
      );
      return Evaluation.safeParse(res.object).success;
    },
  },
  {
    // Same task, but the schema is described in the prompt instead of using the provider's JSON-schema mode.
    name: "structured output (schema in prompt)",
    run: async () => {
      const res = await agent.generate(
        'Evaluate this interview answer on a 0 to 4 scale. Question: "Why JWT?" Answer: "Because it is stateless."',
        {
          providerOptions,
          structuredOutput: { schema: Evaluation, jsonPromptInjection: true },
          abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        },
      );
      return Evaluation.safeParse(res.object).success;
    },
  },
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  console.log(`provider=${provider} model=${model.id} runs=${runs}`);
  for (const check of checks) {
    let passed = 0;
    const times: number[] = [];
    const errors: string[] = [];
    for (let i = 0; i < runs; i++) {
      const start = Date.now();
      try {
        if (await check.run()) passed += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message.slice(0, 160) : String(err));
      }
      times.push(Date.now() - start);
    }
    // Print every run, not only the median: one stalled call is exactly what a user would notice.
    console.log(`${check.name}: ${passed}/${runs} passed, median ${median(times)} ms, runs [${times.join(", ")}] ms`);
    for (const e of new Set(errors)) console.log(`  error: ${e}`);
  }
}

main();
