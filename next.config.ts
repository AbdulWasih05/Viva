import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LibSQL (used by Mastra memory) ships a native binary. Listing these here tells
  // Next.js to load them with plain require() on the server instead of bundling them.
  serverExternalPackages: ["@libsql/client", "@mastra/*"],
};

// Sentry's wrapper hooks its tracing into the Next.js server. No org or auth token is set,
// so nothing is uploaded at build time; tracing itself only runs when SENTRY_DSN is set.
export default withSentryConfig(nextConfig, { silent: true });
