/**
 * The interviewer's tools for looking at the candidate's code mid-interview.
 *
 * Every path the model passes in is checked against the repo's real file list first.
 * A made-up path gets a clear error message back instead of file content.
 */
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { normalizePath } from "../../lib/interview/brief";
import type { RepoContext } from "../context";

/** How much of one file a single readFile call may return. */
export const TOOL_FILE_CAP_CHARS = 4_000;
const MAX_LISTED_PATHS = 150;

/** Pulls the current repo out of the request context that Mastra hands to every tool call. */
function repoFrom(context: { requestContext?: { get: (key: string) => unknown } }): RepoContext {
  const repo = context.requestContext?.get("repo") as RepoContext | undefined;
  if (!repo) throw new Error("No repo in the request context.");
  return repo;
}

export const listFiles = createTool({
  id: "listFiles",
  description: "List file paths in the candidate's repository. Optionally only those inside one folder.",
  inputSchema: z.object({
    folder: z.string().optional().describe('Folder to list, for example "src/components". Leave out for the whole repo.'),
  }),
  outputSchema: z.object({ paths: z.array(z.string()), truncated: z.boolean() }),
  execute: async (input, context) => {
    const repo = repoFrom(context);
    const prefix = input.folder ? `${normalizePath(input.folder).replace(/\/$/, "")}/` : "";
    const paths = repo.filePaths.filter((path) => path.startsWith(prefix));
    repo.activity.push(prefix ? `listing ${prefix}` : "listing files");
    return { paths: paths.slice(0, MAX_LISTED_PATHS), truncated: paths.length > MAX_LISTED_PATHS };
  },
});

export const readFile = createTool({
  id: "readFile",
  description:
    "Read a file from the candidate's repository so you can ask about its actual code. " +
    "The path must be one of the real file paths. Optionally give a line range.",
  inputSchema: z.object({
    path: z.string().describe("Repo-relative file path, copied exactly from the list of real file paths."),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    path: z.string(),
    content: z.string(),
    truncated: z.boolean(),
    error: z.string().optional(),
  }),
  execute: async (input, context) => {
    const repo = repoFrom(context);
    const path = normalizePath(input.path);
    if (!repo.filePaths.includes(path)) {
      // The model invented a path. Tell it so, and let it pick a real one.
      repo.activity.push(`refused ${path} (not a real file)`);
      return { found: false, path, content: "", truncated: false, error: "No such file. Use a path from the list of real file paths." };
    }
    try {
      const text = await repo.readFile(path);
      const lines = text.split("\n");
      const start = (input.startLine ?? 1) - 1;
      const end = input.endLine ?? lines.length;
      const slice = lines.slice(start, end).join("\n");
      repo.filesRead.push(path);
      repo.activity.push(`reading ${path}`);
      return { found: true, path, content: slice.slice(0, TOOL_FILE_CAP_CHARS), truncated: slice.length > TOOL_FILE_CAP_CHARS };
    } catch {
      return { found: false, path, content: "", truncated: false, error: "The file exists but could not be read." };
    }
  },
});

export const getProvenance = createTool({
  id: "getProvenance",
  description:
    "Find out whether a file was written by an AI coding agent, and from which prompt. " +
    "Use it before asking about a file, so you can say 'your session shows the agent wrote this'.",
  inputSchema: z.object({ path: z.string().describe("Repo-relative file path.") }),
  outputSchema: z.object({
    aiAuthored: z.boolean(),
    entries: z.array(z.object({ commit: z.string(), promptSummary: z.string() })),
  }),
  execute: async (input, context) => {
    const repo = repoFrom(context);
    const path = normalizePath(input.path);
    // Filled from Entire checkpoints in Phase 3; until then the list is empty and this answers "no".
    const entries = repo.provenance.filter((entry) => entry.path === path);
    repo.activity.push(`checking who wrote ${path}`);
    return { aiAuthored: entries.length > 0, entries: entries.map((e) => ({ commit: e.commit, promptSummary: e.promptSummary })) };
  },
});
