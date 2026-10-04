/**
 * Cross-session memory of weak spots, kept with Mastra memory on a local LibSQL file.
 *
 * Only in local mode (LOCAL_MODE=true): the file lives on the candidate's own laptop.
 * In hosted mode every function here is a no-op, so the server keeps nothing about anyone.
 *
 * Storage shape: one Mastra thread per repo; the weak spots are that thread's metadata.
 * Plain code reads and writes them (not the model), so what is remembered is predictable.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { z } from "zod";
import { WeakSpotSchema, type WeakSpot } from "../lib/interview/schemas";

export function memoryEnabled(): boolean {
  return process.env.LOCAL_MODE === "true";
}

/** Shown in the UI so a visitor knows why the hosted demo does not remember them. */
export function memoryStatus(): { enabled: boolean; label: string } {
  return memoryEnabled()
    ? { enabled: true, label: "Memory is on: weak spots are saved on this computer only." }
    : { enabled: false, label: "Memory is a local-mode feature. The hosted demo stores nothing about you." };
}

let memory: Memory | undefined;

function getMemory(): Memory {
  if (!memory) {
    // Absolute path: a relative "file:" URL resolves differently under Next.js than in a script.
    // The turbopackIgnore comment stops the bundler from tracing this runtime-only path at build time.
    const dbPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.MEMORY_DB_PATH ?? ".viva/memory.db");
    mkdirSync(path.dirname(dbPath), { recursive: true });
    memory = new Memory({ storage: new LibSQLStore({ id: "viva-memory", url: `file:${dbPath}` }) });
  }
  return memory;
}

/** Thread ids are kept simple: letters, digits, dashes. "github:owner/repo" becomes "viva-github-owner-repo". */
export function threadIdFor(repoId: string): string {
  return `viva-${repoId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/** Last session's weak spots for this repo. Empty when there are none, or in hosted mode. */
export async function recallWeakSpots(repoId: string): Promise<WeakSpot[]> {
  if (!memoryEnabled()) return [];
  const thread = await getMemory().getThreadById({ threadId: threadIdFor(repoId) });
  // Stored data is checked like any other input; anything unexpected reads as "no memory".
  return z.array(WeakSpotSchema).catch([]).parse(thread?.metadata?.weakSpots);
}

export async function saveWeakSpots(repoId: string, weakSpots: WeakSpot[]): Promise<boolean> {
  if (!memoryEnabled()) return false;
  const threadId = threadIdFor(repoId);
  const metadata = { repoId, weakSpots, savedAt: new Date().toISOString() };
  const existing = await getMemory().getThreadById({ threadId });
  if (existing) await getMemory().updateThread({ id: threadId, title: existing.title ?? repoId, metadata });
  else await getMemory().createThread({ threadId, resourceId: threadId, title: repoId, metadata });
  return true;
}

/** "Forget this project": removes everything remembered about one repo. */
export async function forgetProject(repoId: string): Promise<boolean> {
  if (!memoryEnabled()) return false;
  const threadId = threadIdFor(repoId);
  const existing = await getMemory().getThreadById({ threadId });
  if (existing) await getMemory().deleteThread(threadId);
  return Boolean(existing);
}
