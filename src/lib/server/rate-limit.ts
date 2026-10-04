/**
 * Per-IP rate limit for the hosted demo.
 *
 * Every visitor shares one model key with a small per-minute quota, so one busy (or abusive)
 * visitor must not be able to use it all. Counts live in memory: fine for a single instance,
 * and nothing about a visitor is written to disk.
 */
import { isLocalMode } from "./sources";

const WINDOW_MS = 10 * 60 * 1000;

/** How many requests one IP may make per 10 minutes, per kind of request. */
export const LIMITS = {
  /** Reading a repo and writing a brief (the most expensive call). */
  ingest: 8,
  /** Interview turns: enough for two full interviews with follow-ups. */
  turn: 60,
  report: 8,
} as const;

export type LimitKind = keyof typeof LIMITS;

/**
 * Pure check: given the times of earlier requests, may another one go ahead at `now`?
 * Returns the trimmed list of times to store, and how long to wait if the answer is no.
 */
export function checkLimit(times: number[], now: number, limit: number): { allowed: boolean; times: number[]; retryAfterSec: number } {
  const recent = times.filter((time) => now - time < WINDOW_MS);
  if (recent.length >= limit) {
    return { allowed: false, times: recent, retryAfterSec: Math.ceil((recent[0] + WINDOW_MS - now) / 1000) };
  }
  return { allowed: true, times: [...recent, now], retryAfterSec: 0 };
}

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`Too many requests from your network. Please try again in about ${Math.ceil(retryAfterSec / 60)} minute(s).`);
  }
}

const hits = new Map<string, number[]>();

/** The visitor's IP as reported by the proxy in front of the app (Render sets x-forwarded-for). */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Throws RateLimitError when this IP has used up its allowance. Does nothing in local mode. */
export function enforceRateLimit(request: Request, kind: LimitKind): void {
  if (isLocalMode()) return;
  const key = `${kind}:${clientIp(request)}`;
  const result = checkLimit(hits.get(key) ?? [], Date.now(), LIMITS[kind]);
  hits.set(key, result.times);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSec);

  // Keep the map from growing without bound: drop keys whose requests have all expired.
  if (hits.size > 5_000) {
    for (const [other, times] of hits) if (times.every((time) => Date.now() - time >= WINDOW_MS)) hits.delete(other);
  }
}
