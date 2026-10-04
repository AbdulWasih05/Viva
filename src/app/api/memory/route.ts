/** DELETE /api/memory: "forget this project". Only does anything in local mode. */
import { z } from "zod";
import { handle, readBody } from "@/lib/server/http";
import { forgetProject } from "@/mastra/memory";

const Body = z.object({ repoId: z.string().max(500) });

export async function DELETE(request: Request) {
  return handle(async () => {
    const { repoId } = await readBody(request, Body);
    return { forgotten: await forgetProject(repoId) };
  });
}
