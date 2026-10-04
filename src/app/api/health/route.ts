/**
 * GET /api/health: a tiny endpoint for uptime checks.
 * Pinging it every 5 minutes keeps the free Render instance from going to sleep (DECISIONS D7).
 */
import { getModelName, getProvider } from "@/lib/llm/provider";
import { isLocalMode } from "@/lib/server/sources";

export async function GET() {
  return Response.json({ ok: true, mode: isLocalMode() ? "local" : "hosted", provider: getProvider(), model: getModelName() });
}
