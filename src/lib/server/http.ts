/** Small helpers shared by the API routes, so each route stays a few lines long. */
import type { z } from "zod";
import { RateLimitError } from "./rate-limit";
import { UserError } from "./sources";

/** Reads and validates a JSON request body. Throws a UserError with a readable message if it is wrong. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new UserError("The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new UserError(`Invalid request: ${issue.path.join(".") || "body"} ${issue.message}`);
  }
  return parsed.data;
}

/**
 * Runs a route handler and turns any error into a JSON response.
 * A UserError is the user's to fix (400, message shown as-is); anything else is ours (500, generic message).
 */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await run());
  } catch (err) {
    if (err instanceof UserError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof RateLimitError) {
      return Response.json({ error: err.message }, { status: 429, headers: { "retry-after": String(err.retryAfterSec) } });
    }
    // The details go to the server log only: never echo internal errors (or prompts) to the browser.
    console.error("[viva] route error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
  }
}
