import { afterEach, describe, expect, it } from "vitest";
import { LIMITS, RateLimitError, checkLimit, clientIp, enforceRateLimit } from "./rate-limit";

const MINUTE = 60_000;

describe("checkLimit", () => {
  it("allows requests up to the limit and records them", () => {
    let times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const result = checkLimit(times, 1000 + i, 3);
      expect(result.allowed).toBe(true);
      times = result.times;
    }
    expect(times).toHaveLength(3);
  });

  it("refuses the next request and says when to retry", () => {
    const now = 20 * MINUTE;
    const result = checkLimit([now - 9 * MINUTE, now - 5 * MINUTE], now, 2);
    expect(result.allowed).toBe(false);
    // The oldest request leaves the 10-minute window in 1 minute.
    expect(result.retryAfterSec).toBe(60);
    expect(result.times).toHaveLength(2);
  });

  it("forgets requests older than 10 minutes", () => {
    const now = 30 * MINUTE;
    expect(checkLimit([now - 11 * MINUTE, now - 12 * MINUTE], now, 2).allowed).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  const saved = process.env.LOCAL_MODE;
  afterEach(() => {
    process.env.LOCAL_MODE = saved;
  });
  const requestFrom = (ip: string) => new Request("http://viva.test/api/report", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

  it("reads the first address from x-forwarded-for", () => {
    expect(clientIp(requestFrom("203.0.113.7"))).toBe("203.0.113.7");
    expect(clientIp(new Request("http://viva.test/"))).toBe("unknown");
  });

  it("limits each IP separately in hosted mode", () => {
    process.env.LOCAL_MODE = "false";
    for (let i = 0; i < LIMITS.report; i++) enforceRateLimit(requestFrom("203.0.113.8"), "report");
    expect(() => enforceRateLimit(requestFrom("203.0.113.8"), "report")).toThrow(RateLimitError);
    expect(() => enforceRateLimit(requestFrom("203.0.113.9"), "report")).not.toThrow();
  });

  it("does nothing in local mode", () => {
    process.env.LOCAL_MODE = "true";
    for (let i = 0; i < LIMITS.report + 5; i++) enforceRateLimit(requestFrom("203.0.113.10"), "report");
  });
});
