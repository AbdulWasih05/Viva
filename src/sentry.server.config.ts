/**
 * Sentry setup for the server. Loaded once by src/instrumentation.ts.
 *
 * Tracing only starts when SENTRY_DSN is set, so the app runs the same without it.
 * Privacy rule (PRD F8): traces carry metadata only. No prompt, answer or code text is sent,
 * and nothing that identifies the visitor.
 */
import * as Sentry from "@sentry/nextjs";

/** Span attributes that would identify a visitor. They are removed before a span leaves the server. */
const PERSONAL_KEYS = ["user.ip_address", "client.address", "http.client_ip", "user.id", "user.email", "user.name"];

type SpanFields = { op?: string; name?: string; description?: string; data?: Record<string, unknown>; attributes?: Record<string, unknown> };

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Every interview turn is traced. Traffic is tiny, so there is no need to sample.
  tracesSampleRate: 1.0,
  // Collect as little as possible: no visitor info (the SDK attached the IP address by default),
  // no cookies, headers, query strings or request bodies (the body holds the candidate's answers),
  // and no model inputs or outputs.
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
  },
  integrations: [
    // Automatic spans for AI SDK calls, with the prompt and the reply text switched off.
    Sentry.vercelAIIntegration({ recordInputs: false, recordOutputs: false }),
  ],
  beforeSendSpan(span) {
    // The span's shape differs between SDK modes, so the fields are read defensively.
    const raw = span as unknown as SpanFields;
    const data = raw.data ?? raw.attributes ?? {};

    // Second line of defence: drop visitor-identifying attributes even if a setting above is ignored.
    for (const key of PERSONAL_KEYS) delete data[key];

    // SENTRY_DEBUG_SPANS=true prints each AI span (name and attributes) to the server log,
    // so what is sent to Sentry can be checked without opening Sentry.
    if (process.env.SENTRY_DEBUG_SPANS === "true") {
      const op = raw.op ?? String(data["sentry.op"] ?? "");
      if (op.startsWith("gen_ai.")) {
        const shown = Object.entries(data).filter(([key]) => key.startsWith("viva.") || key.startsWith("gen_ai."));
        console.info(`[viva] span ${op} "${raw.name ?? raw.description ?? ""}" ${shown.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")}`);
        // Lists every other attribute name (not the values), to check that nothing personal is attached.
        const others = Object.keys(data).filter((key) => !key.startsWith("viva.") && !key.startsWith("gen_ai."));
        console.info(`[viva] span ${op} other attribute names: ${others.join(", ") || "(none)"}`);
      }
    }
    return span;
  },
});
