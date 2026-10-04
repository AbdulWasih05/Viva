/** The Mastra instance. Agents are registered here so tracing (Phase 7) sees every call they make. */
import { Mastra } from "@mastra/core";
import { interviewer } from "./agents/interviewer";

export const mastra = new Mastra({
  agents: { interviewer },
});
