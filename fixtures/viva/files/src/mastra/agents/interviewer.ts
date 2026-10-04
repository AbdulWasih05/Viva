/**
 * The interviewer: a Mastra agent with tools for reading the candidate's code.
 *
 * Its instructions depend on the persona chosen for the session, which arrives in the request context.
 * What to ask next and how to score are decided by the prompts and state machine in src/lib/interview;
 * the agent's own job is to look at real code (through the tools) and put the question into words.
 */
import { Agent } from "@mastra/core/agent";
import { interviewerInstructions } from "../../lib/interview/prompts";
import { PersonaSchema } from "../../lib/interview/schemas";
import { getModelConfig } from "../../lib/llm/provider";
import { getProvenance, listFiles, readFile } from "../tools/repo";

const TOOL_RULES = [
  "You have tools to look at the candidate's repository:",
  "- readFile(path): open a file. Do this before asking how a specific piece of code works, and base the question on what you read.",
  "- listFiles(folder?): see which files exist.",
  "- getProvenance(path): check whether an AI coding agent wrote the file, and from which prompt.",
  "Use at most two tool calls per question. Never ask about code you have not read.",
].join("\n");

export const interviewer = new Agent({
  id: "interviewer",
  name: "Viva interviewer",
  instructions: ({ requestContext }) => {
    const persona = PersonaSchema.catch("tough").parse(requestContext.get("persona"));
    const targetRole = String(requestContext.get("targetRole") ?? "Software engineer");
    return `${interviewerInstructions(persona, targetRole)}\n\n${TOOL_RULES}`;
  },
  // A function, so LLM_PROVIDER is read when a call is made rather than when this file is first loaded.
  model: () => getModelConfig(),
  tools: { readFile, listFiles, getProvenance },
});
