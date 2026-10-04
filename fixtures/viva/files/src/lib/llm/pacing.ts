/**
 * Token pacing for the hosted model.
 *
 * Google's free tier allows 16,000 input tokens per minute for Gemma 4 26B. When that is used up,
 * a request is either refused (HTTP 429) or, as we measured, sometimes just hangs with no answer.
 * So before each hosted call we check how many tokens this process sent in the last minute and,
 * if the next call would go over the limit, wait until enough of them are older than a minute.
 *
 * The record lives in memory, so it covers one server process: on the hosted demo that means
 * all visitors share one queue, which is exactly how the quota works.
 */

const WINDOW_MS = 60_000;

/** Kept below the real 16,000 because our token count is an estimate. */
export function tokensPerMinuteLimit(): number {
  return Number(process.env.HOSTED_TOKENS_PER_MINUTE ?? 13_000);
}

/** Measured on our prompts: about 3.2 characters per token. Dividing by 3 errs on the safe side. */
export function estimatePromptTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

export type Usage = { at: number; tokens: number };

/**
 * How long to wait before a call of `tokens` fits in the budget. Pure function.
 * `usage` is the list of recent calls; entries older than a minute no longer count.
 */
export function msUntilBudget(usage: Usage[], tokens: number, now: number, limit: number): number {
  const recent = usage.filter((entry) => now - entry.at < WINDOW_MS).sort((a, b) => a.at - b.at);
  let used = recent.reduce((sum, entry) => sum + entry.tokens, 0);
  // A single call bigger than the whole limit can never fit; let it through rather than wait forever.
  if (tokens >= limit) return recent.length === 0 ? 0 : recent[recent.length - 1].at + WINDOW_MS - now;

  // Drop the oldest entries one by one until the new call fits; wait until the last dropped one expires.
  let wait = 0;
  for (const entry of recent) {
    if (used + tokens <= limit) break;
    used -= entry.tokens;
    wait = entry.at + WINDOW_MS - now;
  }
  return Math.max(0, wait);
}

const usage: Usage[] = [];

/** Waits if needed, then records the call. Call this right before sending a hosted request. */
export async function paceHostedCall(promptChars: number): Promise<number> {
  const tokens = estimatePromptTokens(promptChars);
  const wait = msUntilBudget(usage, tokens, Date.now(), tokensPerMinuteLimit());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const now = Date.now();
  usage.push({ at: now, tokens });
  // Forget entries that can no longer matter.
  while (usage.length > 0 && now - usage[0].at >= WINDOW_MS) usage.shift();
  return wait;
}
