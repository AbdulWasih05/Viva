/** POST /api/report: the final report. In local mode it also saves the weak spots for next time. */
import { z } from "zod";
import { buildReport, reportToMarkdown, weakSpotsToRemember } from "@/lib/interview/report";
import { InterviewStateSchema } from "@/lib/interview/schemas";
import { handle, readBody } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { saveWeakSpots } from "@/mastra/memory";

const Body = z.object({ state: InterviewStateSchema });

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "report");
    const { state } = await readBody(request, Body);
    const { report, meta } = await buildReport(state);
    const today = new Date().toISOString().slice(0, 10);
    // saveWeakSpots does nothing and returns false in hosted mode.
    const saved = await saveWeakSpots(state.repoId, weakSpotsToRemember(report, today));
    return { report, markdown: reportToMarkdown(report, state.repoLabel), savedToMemory: saved, usedFallback: meta.usedFallback };
  });
}
