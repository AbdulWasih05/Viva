/**
 * Runs the interviewer agent for one structured answer (a question draft).
 * It has the same shape as the plain model call in src/lib/llm/structured.ts, so the turn logic
 * can use either one. The difference: here the model may call tools before it answers.
 */
import { getCallTimeoutMs, getProvider, providerOptions } from "../lib/llm/provider";
import { paceHostedCall } from "../lib/llm/pacing";
import type { GenerateFn } from "../lib/llm/structured";
import type { Persona } from "../lib/interview/schemas";
import { createRequestContext, type RepoContext } from "./context";
import { mastra } from "./index";

/**
 * Two tool calls, one spare step in case the model tries a third (the tools refuse it), then the answer.
 * Each step is one request to the model and resends the prompt.
 */
const MAX_STEPS = 4;

export function interviewerGenerate(input: { repo: RepoContext; persona: Persona; targetRole: string }): GenerateFn {
  return async ({ prompt, schema, timeoutMs }) => {
    // A call with tools resends the prompt on every step, so budget for about two steps.
    const pace = getProvider() === "hosted" ? await paceHostedCall(prompt.length * 2) : undefined;
    // Every attempt (including the repair retry) starts with a fresh tool allowance.
    input.repo.toolCalls = 0;

    const res = await mastra.getAgent("interviewer").generate(prompt, {
      requestContext: createRequestContext(input),
      providerOptions,
      maxSteps: MAX_STEPS,
      structuredOutput: { schema, jsonPromptInjection: true },
      // Tool steps add round trips, so the agent gets twice the time of a plain call.
      abortSignal: AbortSignal.timeout((timeoutMs ?? getCallTimeoutMs()) * 2),
    });

    const usage = res.usage as { inputTokens?: number; outputTokens?: number } | undefined;
    // The real token count replaces the estimate, so the next call is paced on what was actually sent.
    pace?.settle(usage?.inputTokens);
    return { object: res.object, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens, pacedMs: pace?.waitedMs ?? 0 };
  };
}
