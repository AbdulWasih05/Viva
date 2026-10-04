/**
 * Sentry setup for the server. Loaded once by src/instrumentation.ts.
 *
 * Tracing only starts when SENTRY_DSN is set, so the app runs the same without it.
 * Privacy rule (PRD F8): traces carry metadata only. No prompt, answer or code text is sent.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Every interview turn is traced. Traffic is tiny, so there is no need to sample.
  tracesSampleRate: 1.0,
  integrations: [
    // Automatic spans for AI SDK calls, with the prompt and the reply text switched off.
    Sentry.vercelAIIntegration({ recordInputs: false, recordOutputs: false }),
  ],
  beforeSendSpan(span) {
    // SENTRY_DEBUG_SPANS=true prints each AI span (name and attributes) to the server log,
    // so what is sent to Sentry can be checked without opening Sentry.
    if (process.env.SENTRY_DEBUG_SPANS === "true") {
      // The span's shape differs between SDK modes, so the fields are read defensively.
      const raw = span as unknown as { op?: string; name?: string; description?: string; data?: Record<string, unknown>; attributes?: Record<string, unknown> };
      const data = raw.data ?? raw.attributes ?? {};
      const op = raw.op ?? String(data["sentry.op"] ?? "");
      if (op.startsWith("gen_ai.")) {
        const shown = Object.entries(data).filter(([key]) => key.startsWith("viva.") || key.startsWith("gen_ai."));
        console.info(`[viva] span ${op} "${raw.name ?? raw.description ?? ""}" ${shown.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")}`);
      }
    }
    return span;
  },
});
