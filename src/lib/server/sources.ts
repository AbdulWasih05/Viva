/**
 * Server-side: turn what the user typed (or the repo id stored in the interview state)
 * back into a readable repo.
 *
 * The API routes are stateless, so every turn needs the repo again in order to open files.
 * A small in-memory cache avoids asking GitHub for the file list on every turn.
 * It holds no user data: only the file list of public repos, for 30 minutes.
 */
import { existsSync } from "node:fs";
import { FIXTURE_NAMES, loadFixture, type FixtureName } from "../ingest/fixture";
import { loadGitHubRepo, parseGitHubUrl } from "../ingest/github";
import { loadLocalRepo } from "../ingest/local";
import type { RepoSource } from "../ingest/types";

export function isLocalMode(): boolean {
  return process.env.LOCAL_MODE === "true";
}

/** The sample repos shown as buttons on the start screen. Their briefs are cached in fixtures/briefs/. */
export const SAMPLES: { id: FixtureName; label: string; description: string }[] = [
  { id: "viva", label: "Viva (this project)", description: "TypeScript, Next.js, Mastra. Has Entire checkpoints, so Viva asks about AI-written code." },
  { id: "vidyut-mitra", label: "Vidyut Mitra", description: "Python backend + Next.js dashboard: a WhatsApp agent that explains electricity bills." },
  { id: "portfolio-new", label: "Portfolio", description: "Vite + React personal portfolio site." },
];

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { source: RepoSource; at: number }>();

function remember(source: RepoSource): RepoSource {
  cache.set(source.id, { source, at: Date.now() });
  // Keep the cache small: drop anything older than the limit.
  for (const [id, entry] of cache) if (Date.now() - entry.at > CACHE_MS) cache.delete(id);
  return source;
}

/** A friendly error the UI can show as-is. */
export class UserError extends Error {}

/**
 * Resolves the start-screen input: "sample:<name>", a GitHub URL or owner/repo,
 * or (local mode only) a folder path on this machine.
 */
export async function resolveTarget(target: string): Promise<RepoSource> {
  const input = target.trim();
  if (!input) throw new UserError("Paste a GitHub repository URL to begin.");

  if (input.startsWith("sample:")) {
    const name = input.slice("sample:".length);
    if (!(FIXTURE_NAMES as readonly string[]).includes(name)) throw new UserError("Unknown sample repo.");
    return remember(loadFixture(name as FixtureName));
  }

  // A folder path is only accepted in local mode, and only if it exists on this machine.
  if (isLocalMode() && !input.startsWith("http") && existsSync(/*turbopackIgnore: true*/ input)) {
    return remember(await loadLocalRepo(input));
  }

  if (!parseGitHubUrl(input)) {
    throw new UserError(isLocalMode() ? "Enter a GitHub repository URL or a folder path that exists on this computer." : "Enter a public GitHub repository URL, for example https://github.com/owner/repo.");
  }
  try {
    return remember(await loadGitHubRepo(input));
  } catch (err) {
    throw new UserError(err instanceof Error ? err.message : "Could not read that repository.");
  }
}

/** Gets the repo back from the id stored in the interview state ("fixture:x", "github:o/r", "local:<path>"). */
export async function resolveRepoId(repoId: string): Promise<RepoSource> {
  const cached = cache.get(repoId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.source;

  if (repoId.startsWith("fixture:")) return resolveTarget(`sample:${repoId.slice("fixture:".length)}`);
  if (repoId.startsWith("github:")) return resolveTarget(repoId.slice("github:".length));
  if (repoId.startsWith("local:")) {
    if (!isLocalMode()) throw new UserError("Local folders can only be read in local mode.");
    return resolveTarget(repoId.slice("local:".length));
  }
  throw new UserError("Unknown repository.");
}
