import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateStructured, rateLimitWaitMs, type GenerateFn } from "./structured";

const Schema = z.object({ score: z.number().int().min(0).max(4) });
const base = { instructions: "test", prompt: "score this", schema: Schema, fallback: { score: 0 } };

/** A fake model that returns the given replies in order; an Error in the list is thrown. */
function fakeModel(replies: unknown[]): { generate: GenerateFn; prompts: string[] } {
  const prompts: string[] = [];
  let call = 0;
  return {
    prompts,
    generate: async ({ prompt }) => {
      prompts.push(prompt);
      const reply = replies[call++];
      if (reply instanceof Error) throw reply;
      return { object: reply };
    },
  };
}

describe("generateStructured", () => {
  it("returns a valid first reply without repair", async () => {
    const model = fakeModel([{ score: 3 }]);
    const { value, meta } = await generateStructured({ ...base, generate: model.generate });
    expect(value).toEqual({ score: 3 });
    expect(meta.repaired).toBe(false);
    expect(meta.usedFallback).toBe(false);
    expect(model.prompts).toHaveLength(1);
  });

  it("retries once and tells the model what was wrong", async () => {
    const model = fakeModel([{ score: 9 }, { score: 2 }]);
    const { value, meta } = await generateStructured({ ...base, generate: model.generate });
    expect(value).toEqual({ score: 2 });
    expect(meta.repaired).toBe(true);
    expect(meta.usedFallback).toBe(false);
    expect(model.prompts[1]).toContain("previous reply could not be used");
  });

  it("recovers when the first call throws (timeout, network error)", async () => {
    const model = fakeModel([new Error("timed out"), { score: 1 }]);
    const { value, meta } = await generateStructured({ ...base, generate: model.generate });
    expect(value).toEqual({ score: 1 });
    expect(meta.repaired).toBe(true);
  });

  it("waits out a rate limit and retries with the original prompt", async () => {
    const quota = new Error("You exceeded your current quota. Please retry in 4.36s.");
    const model = fakeModel([quota, { score: 4 }]);
    const { value, meta } = await generateStructured({ ...base, generate: model.generate, maxRateLimitWaitMs: 0 });
    expect(value).toEqual({ score: 4 });
    expect(meta.rateLimited).toBe(true);
    // The quota error is not the model's fault, so the retry prompt carries no "previous reply" complaint.
    expect(model.prompts[1]).toBe(model.prompts[0]);
  });

  it("reads the wait time from a rate-limit error", () => {
    expect(rateLimitWaitMs("Quota exceeded. Please retry in 4.368105718s.")).toBe(6000);
    expect(rateLimitWaitMs("Please retry in 47.2s. RESOURCE_EXHAUSTED")).toBe(49000);
    expect(rateLimitWaitMs("429 quota, retry in 300s")).toBe(60000); // capped at one minute
    expect(rateLimitWaitMs("The operation was aborted due to timeout")).toBeNull();
  });

  it("returns the fallback after two bad replies and never throws", async () => {
    const model = fakeModel(["not json", new Error("boom")]);
    const { value, meta } = await generateStructured({ ...base, generate: model.generate });
    expect(value).toEqual({ score: 0 });
    expect(meta.usedFallback).toBe(true);
    expect(meta.error).toContain("boom");
    expect(model.prompts).toHaveLength(2);
  });
});
