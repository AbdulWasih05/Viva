/** Next.js calls register() once when the server starts. It loads the Sentry setup on the Node.js runtime. */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

/** Reports errors thrown while handling a request (route handlers, server components). */
export const onRequestError = Sentry.captureRequestError;
