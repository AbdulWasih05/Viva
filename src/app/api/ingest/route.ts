/** POST /api/ingest: repo -> project brief, AI-written areas, and last session's weak spots. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createBrief } from "@/lib/interview/brief";
import { ProjectBriefSchema } from "@/lib/interview/schemas";
import { addAiHooks, aiWrittenAreas, loadProvenance } from "@/lib/provenance";
import { handle, readBody } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { resolveTarget } from "@/lib/server/sources";
import { memoryStatus, recallWeakSpots } from "@/mastra/memory";

const Body = z.object({
  target: z.string().max(500),
  /** The candidate's one-line correction to a brief they have already seen. */
  correction: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "ingest");
    const { target, correction } = await readBody(request, Body);
    const source = await resolveTarget(target);
    const { provenance, checkpointCount, hint } = await loadProvenance(source);

    // Sample repos have a brief saved by the eval run, so a visitor gets it instantly and it costs
    // no model tokens. A correction always goes to the model, because the brief has to change.
    const saved = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "fixtures/briefs", `${source.label}.json`);
    const useSaved = source.id.startsWith("fixture:") && !correction && existsSync(saved);

    let brief;
    let inventedPathsDropped = 0;
    let filesUsed: string[] = [];
    let usedFallback = false;
    if (useSaved) {
      brief = ProjectBriefSchema.parse(JSON.parse(readFileSync(saved, "utf8")));
    } else {
      const result = await createBrief(source, { correction });
      brief = addAiHooks(result.brief, provenance);
      inventedPathsDropped = result.inventedPathsDropped;
      filesUsed = result.filesUsed.map((file) => file.path);
      usedFallback = result.meta.usedFallback;
    }

    return {
      repoId: source.id,
      repoLabel: source.label,
      filePaths: source.files.map((file) => file.path),
      brief,
      provenance,
      aiAreas: aiWrittenAreas(provenance),
      checkpointCount,
      provenanceHint: hint,
      filesUsed,
      inventedPathsDropped,
      usedFallback,
      cached: useSaved,
      previousWeakSpots: await recallWeakSpots(source.id),
      memory: memoryStatus(),
    };
  });
}
