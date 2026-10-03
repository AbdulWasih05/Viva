import { describe, expect, it } from "vitest";
import { z } from "zod";

// Phase 0 placeholder: proves Vitest and zod are wired up. Replaced by real tests in Phase 1.
describe("tooling", () => {
  it("parses a value with zod", () => {
    const schema = z.object({ score: z.number().min(0).max(4) });
    expect(schema.parse({ score: 3 })).toEqual({ score: 3 });
  });
});
