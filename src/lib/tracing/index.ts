/**
 * Tracing helpers: thin wrappers around Sentry spans, using Sentry's names for AI agent traces
 * (gen_ai.invoke_agent for a turn, gen_ai.chat for a model call, gen_ai.execute_tool for a tool).
 *
 * When Sentry is not configured these just run the function, so nothing else has to care.
 * Attributes are numbers, booleans and short labels only: never prompt, answer or code text.
 */
import * as Sentry from "@sentry/nextjs";

export type Attributes = Record<string, string | number | boolean | undefined>;

/** Sets attributes on a span, skipping undefined values. Every Viva quality attribute starts with "viva.". */
function setAttributes(span: Sentry.Span | undefined, attributes: Attributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) span?.setAttribute(key, value);
  }
}

/**
 * Runs `fn` inside a span. `fn` receives `annotate`, which adds attributes that are only
 * known once the work is done (was the JSON repaired, how many tokens were used, ...).
 */
export function traced<T>(
  options: { op: "gen_ai.invoke_agent" | "gen_ai.chat" | "gen_ai.execute_tool"; name: string; attributes?: Attributes },
  fn: (annotate: (attributes: Attributes) => void) => Promise<T>,
): Promise<T> {
  return Sentry.startSpan({ op: options.op, name: options.name }, async (span) => {
    setAttributes(span, { "gen_ai.operation.name": options.op.replace("gen_ai.", ""), ...options.attributes });
    return fn((attributes) => setAttributes(span, attributes));
  });
}
