/** POST /api/turn: one interview turn. The whole interview state comes in and goes back out. */
import { z } from "zod";
import { InterviewStateSchema } from "@/lib/interview/schemas";
import { endEarly, runTurn } from "@/lib/interview/turn";
import { handle, readBody } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { resolveRepoId } from "@/lib/server/sources";
import { createAgentDeps } from "@/mastra/deps";

const Body = z.object({
  state: InterviewStateSchema,
  /** The candidate's answer to the pending question. Left out on the very first turn. */
  answer: z.string().max(6000).optional(),
  /** "end" stops the interview: no more questions, the report covers what was answered. */
  action: z.enum(["end"]).optional(),
});

export async function POST(request: Request) {
  return handle(async () => {
    enforceRateLimit(request, "turn");
    const { state, answer, action } = await readBody(request, Body);
    if (action === "end") return { state: endEarly(state), done: true, toolActivity: [] };

    // The repo is looked up again from its id so the agent's tools can open files.
    const source = await resolveRepoId(state.repoId);
    const turn = await runTurn(state, answer, createAgentDeps(source, state.settings, state.provenance));
    return {
      state: turn.state,
      evaluation: turn.evaluation,
      nextQuestion: turn.nextQuestion,
      done: turn.done,
      toolActivity: turn.toolActivity,
    };
  });
}
