/**
 * The one place that decides which Gemma the app talks to.
 *
 * Every model call goes through getModelConfig(), so switching between the hosted model
 * and the local Ollama model is a single env variable (LLM_PROVIDER).
 */

export type Provider = "hosted" | "ollama";

export function getProvider(): Provider {
  return process.env.LLM_PROVIDER === "ollama" ? "ollama" : "hosted";
}

/** The model name without any provider prefix, for logs, reports and traces. */
export function getModelName(provider: Provider = getProvider()): string {
  return provider === "hosted"
    ? (process.env.HOSTED_MODEL ?? "gemma-4-26b-a4b-it")
    : (process.env.OLLAMA_MODEL ?? "gemma4:e4b");
}

/**
 * The model config in the shape Mastra's model router expects: "<provider>/<model>".
 *
 * - hosted, no HOSTED_BASE_URL: Google AI Studio through Google's native API.
 * - hosted, with HOSTED_BASE_URL: any OpenAI-compatible endpoint (the OpenRouter fallback).
 *   This path is documented but has not been run by us yet.
 * - ollama: Ollama's OpenAI-compatible endpoint on this machine.
 */
export function getModelConfig(provider: Provider = getProvider()) {
  const name = getModelName(provider);

  if (provider === "ollama") {
    return {
      id: `ollama/${name}` as const,
      url: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
    };
  }

  const baseUrl = process.env.HOSTED_BASE_URL?.trim();
  if (baseUrl) {
    return { id: `custom/${name}` as const, url: baseUrl, apiKey: process.env.HOSTED_API_KEY };
  }
  return { id: `google/${name}` as const, apiKey: process.env.HOSTED_API_KEY };
}

/**
 * Gemma 4 "thinks" before answering by default, which adds many seconds per call.
 * Minimal thinking keeps an interview turn fast. Only Google's API reads this option.
 */
export const providerOptions = {
  google: { thinkingConfig: { thinkingLevel: "minimal" as const } },
};

/**
 * How long one model call may take before we give up on it.
 * Hosted calls answer in seconds; without a limit a silent hang lasts 5 minutes
 * (Node's default fetch timeout). Local CPU inference really does need minutes.
 */
export function getCallTimeoutMs(provider: Provider = getProvider()): number {
  return provider === "hosted" ? 30_000 : 900_000;
}
