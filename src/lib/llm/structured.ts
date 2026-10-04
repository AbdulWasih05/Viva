/**
 * Structured output helper: ask Gemma for JSON, check it with zod, repair once, then fall back.
 *
 * Rule from CLAUDE.md: bad model output must never crash the UI. So this function never throws.
 * It always returns a value of the right type plus metadata saying how it got there.
 */
import { Agent } from "@mastra/core/agent";
import type { z } from "zod";
import { traced } from "../tracing";
import { paceHostedCall } from "./pacing";
import { getCallTimeoutMs, getModelConfig, getModelName, getProvider, providerOptions } from "./provider";

export type StructuredMeta = {
  provider: string;
  model: string;
  /** Wall-clock time for all attempts together. */
  ms: number;
  /** True when the first reply was unusable and the second attempt was needed. */
  repaired: boolean;
  /** True when both attempts failed and the caller's fallback value was returned. */
  usedFallback: boolean;
  /** True when the provider said "too many requests" and we waited before trying again. */
  rateLimited: boolean;
  /** Time spent waiting for the tokens-per-minute budget before sending (not model time). */
  pacedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type GenerateArgs = { instructions: string; prompt: string; schema: z.ZodType; timeoutMs?: number };
export type GenerateResult = { object: unknown; inputTokens?: number; outputTokens?: number; pacedMs?: number };
/** The model call itself. Tests pass a fake one; the app uses mastraGenerate below. */
export type GenerateFn = (args: GenerateArgs) => Promise<GenerateResult>;

/** Real model call through a Mastra agent. */
export const mastraGenerate: GenerateFn = async ({ instructions, prompt, schema, timeoutMs }) => {
  // Stay under the hosted free tier's tokens-per-minute quota (see pacing.ts). Local models have no quota.
  const pace = getProvider() === "hosted" ? await paceHostedCall(instructions.length + prompt.length) : undefined;
  const agent = new Agent({ id: "viva-structured", name: "Viva", instructions, model: getModelConfig() });
  const res = await agent.generate(prompt, {
    providerOptions,
    // The schema is described in the prompt instead of using Google's JSON-schema mode,
    // which hung without answering in our Phase 0 tests (DECISIONS D25).
    structuredOutput: { schema, jsonPromptInjection: true },
    abortSignal: AbortSignal.timeout(timeoutMs ?? getCallTimeoutMs()),
  });
  const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
  pace?.settle(usage?.inputTokens);
  return { object: res.object, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, pacedMs: pace?.waitedMs ?? 0 };
};

/**
 * Google's free tier answers "Please retry in 12.5s" when the per-minute token quota is used up.
 * Returns that wait in milliseconds, or null when the error is not a rate limit.
 */
export function rateLimitWaitMs(errorMessage: string): number | null {
  if (!/quota|rate limit|429|RESOURCE_EXHAUSTED/i.test(errorMessage)) return null;
  const match = errorMessage.match(/retry in ([\d.]+)\s*s/i);
  const seconds = match ? Number(match[1]) : 15;
  // Never wait longer than a minute: the quota window is one minute.
  return Math.min(Math.ceil(seconds) + 1, 60) * 1000;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asks the model for a value of the schema's type. Traced as one "gen_ai.chat" span whose
 * attributes say how the call went: repaired, fell back, rate limited, time, tokens.
 */
export async function generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<{ value: T; meta: StructuredMeta }> {
  return traced(
    {
      op: "gen_ai.chat",
      name: `chat ${getModelName()}`,
      attributes: { "gen_ai.request.model": getModelName(), "gen_ai.provider.name": getProvider(), "viva.call": options.label ?? "other" },
    },
    async (annotate) => {
      const result = await runStructured(options);
      annotate({
        "viva.json_repair_used": result.meta.repaired,
        "viva.fallback_used": result.meta.usedFallback,
        "viva.rate_limited": result.meta.rateLimited,
        "viva.waited_for_budget_ms": result.meta.pacedMs,
        "gen_ai.usage.input_tokens": result.meta.inputTokens,
        "gen_ai.usage.output_tokens": result.meta.outputTokens,
      });
      return result;
    },
  );
}

type GenerateStructuredOptions<T> = {
  /** What the call is for (brief, question, evaluation, report). Shown on the trace. */
  label?: string;
  instructions: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Returned when the model fails twice. Must be safe to show to the user. */
  fallback: T;
  generate?: GenerateFn;
  /** Overrides the default per-call time limit (long prompts such as the brief need more). */
  timeoutMs?: number;
  /** Tests set this to 0 so a simulated rate limit does not really wait. */
  maxRateLimitWaitMs?: number;
  /** 2 by default (one repair retry). The agent path uses 1 because it has its own, cheaper plan B. */
  maxAttempts?: 1 | 2;
};

async function runStructured<T>(options: GenerateStructuredOptions<T>): Promise<{ value: T; meta: StructuredMeta }> {
  const { instructions, prompt, schema, fallback, timeoutMs } = options;
  const generate = options.generate ?? mastraGenerate;
  const start = Date.now();
  const meta: StructuredMeta = {
    provider: getProvider(),
    model: getModelName(),
    ms: 0,
    repaired: false,
    usedFallback: false,
    rateLimited: false,
    pacedMs: 0,
  };

  let lastError = "";
  // Set only when the model replied but the reply did not match the schema.
  let replyProblem = "";
  for (const attempt of options.maxAttempts === 1 ? [1] : [1, 2]) {
    // On the second attempt, tell the model what was wrong with its first reply (if it gave one).
    const attemptPrompt = replyProblem
      ? `${prompt}\n\nYour previous reply could not be used: ${replyProblem}\nReply again with only valid JSON that matches the schema.`
      : prompt;
    try {
      const res = await generate({ instructions, prompt: attemptPrompt, schema, timeoutMs });
      meta.pacedMs += res.pacedMs ?? 0;
      meta.inputTokens = res.inputTokens;
      meta.outputTokens = res.outputTokens;
      const parsed = schema.safeParse(res.object);
      if (parsed.success) {
        meta.repaired = attempt === 2;
        meta.ms = Date.now() - start;
        // Metadata only (no prompt or answer text), so slow calls can be found in the server log.
        console.info(`[viva] model call ok: ${meta.ms} ms (waited ${meta.pacedMs} ms for budget), ${meta.inputTokens ?? "?"} in / ${meta.outputTokens ?? "?"} out tokens, attempt ${attempt}`);
        return { value: parsed.data, meta };
      }
      replyProblem = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      lastError = replyProblem;
      console.warn(`[viva] model reply did not match the schema (attempt ${attempt}, ${Date.now() - start} ms): ${replyProblem.slice(0, 160)}`);
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 400) : String(err);
      // Logged so a failing model call is visible on the server. Only the error's first line is
      // printed: provider errors carry no prompt or answer text there.
      console.warn(`[viva] model call failed (attempt ${attempt}, ${Date.now() - start} ms): ${lastError.split("\n")[0].slice(0, 160)}`);
      // Rate limited: wait for the quota window the provider named, then use the second attempt.
      const wait = rateLimitWaitMs(lastError);
      if (wait !== null && attempt === 1) {
        meta.rateLimited = true;
        await sleep(Math.min(wait, options.maxRateLimitWaitMs ?? wait));
      }
    }
  }

  meta.repaired = true;
  meta.usedFallback = true;
  meta.error = lastError;
  meta.ms = Date.now() - start;
  return { value: fallback, meta };
}
