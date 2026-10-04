import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LibSQL (used by Mastra memory) ships a native binary. Listing these here tells
  // Next.js to load them with plain require() on the server instead of bundling them.
  serverExternalPackages: ["@libsql/client", "@mastra/*"],
};

export default nextConfig;
