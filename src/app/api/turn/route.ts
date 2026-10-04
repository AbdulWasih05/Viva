/** POST /api/turn: one interview turn. The whole interview state comes in and goes back out. */
import { z } from "zod";
import { InterviewStateSchema } from "@/lib/interview/schemas";
import { endEarly, runTurn } from "@/lib/interview/turn";
import { handle, readBody } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { resolveRepoId } from "@/lib/server/sources";
import { traced } from "@/lib/tracing";
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
    // One trace per turn: this span is the parent of the model calls and tool calls inside it.
    const turn = await traced(
      { op: "gen_ai.invoke_agent", name: "interview turn", attributes: { "gen_ai.agent.name": "interviewer", "viva.persona": state.settings.persona } },
      async (annotate) => {
        const result = await runTurn(state, answer, createAgentDeps(source, state.settings, state.provenance));
        // Quality facts for this turn. Booleans and counts only; no answer or question text.
        const quality = result.quality;
        const followUp = quality.find((q) => q.followUpReferencesAnswer !== null);
        const deepDive = quality.find((q) => q.questionNamesRealFile !== null);
        annotate({
          "viva.round": result.nextQuestion?.round,
          "viva.is_follow_up": result.nextQuestion?.isFollowUp,
          "viva.invented_path_dropped": quality.some((q) => q.inventedPathDropped),
          "viva.json_repair_used": quality.some((q) => q.jsonRepairUsed),
          "viva.fallback_used": quality.some((q) => q.fallbackUsed),
          "viva.ai_authored_question": quality.some((q) => q.aiAuthoredQuestion),
          "viva.followup_references_answer": followUp?.followUpReferencesAnswer ?? undefined,
          "viva.question_names_real_file": deepDive?.questionNamesRealFile ?? undefined,
          "viva.tool_calls": result.toolActivity.length,
          "viva.score": result.evaluation?.evaluated ? result.evaluation.score : undefined,
        });
        return result;
      },
    );
    return {
      state: turn.state,
      evaluation: turn.evaluation,
      nextQuestion: turn.nextQuestion,
      done: turn.done,
      toolActivity: turn.toolActivity,
    };
  });
}
