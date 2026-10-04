import { describe, expect, it } from "vitest";
import { estimatePromptTokens, msUntilBudget } from "./pacing";

const LIMIT = 13_000;
const now = 100_000;

describe("msUntilBudget", () => {
  it("does not wait when the call fits", () => {
    expect(msUntilBudget([], 8_000, now, LIMIT)).toBe(0);
    expect(msUntilBudget([{ at: now - 10_000, tokens: 4_000 }], 8_000, now, LIMIT)).toBe(0);
  });

  it("ignores calls older than a minute", () => {
    expect(msUntilBudget([{ at: now - 61_000, tokens: 12_000 }], 8_000, now, LIMIT)).toBe(0);
  });

  it("waits until the oldest call leaves the one-minute window", () => {
    // 8,000 sent 20 s ago: an 8,000 call must wait the remaining 40 s.
    expect(msUntilBudget([{ at: now - 20_000, tokens: 8_000 }], 8_000, now, LIMIT)).toBe(40_000);
  });

  it("waits only as long as needed when several calls are in the window", () => {
    const usage = [
      { at: now - 50_000, tokens: 6_000 },
      { at: now - 30_000, tokens: 5_000 },
    ];
    // 11,000 used; a 3,000 call needs the first entry (expires in 10 s) to go.
    expect(msUntilBudget(usage, 3_000, now, LIMIT)).toBe(10_000);
    // A 9,000 call needs both to go (the second expires in 30 s).
    expect(msUntilBudget(usage, 9_000, now, LIMIT)).toBe(30_000);
  });

  it("lets an oversized call through once the window is empty instead of waiting forever", () => {
    expect(msUntilBudget([], 20_000, now, LIMIT)).toBe(0);
    expect(msUntilBudget([{ at: now - 15_000, tokens: 1_000 }], 20_000, now, LIMIT)).toBe(45_000);
  });
});

describe("estimatePromptTokens", () => {
  it("rounds up at three characters per token", () => {
    expect(estimatePromptTokens(24_000)).toBe(8_000);
    expect(estimatePromptTokens(10)).toBe(4);
  });
});
