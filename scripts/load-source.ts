/** Shared by the CLI scripts: turn a command-line target into a repo Viva can read. */
import { existsSync } from "node:fs";
import { FIXTURE_NAMES, loadFixture, type FixtureName } from "../src/lib/ingest/fixture";
import { loadGitHubRepo } from "../src/lib/ingest/github";
import { loadLocalRepo } from "../src/lib/ingest/local";
import type { RepoSource } from "../src/lib/ingest/types";

/** A fixture name, a folder that exists on disk (needs LOCAL_MODE=true), or else a GitHub URL / owner/repo. */
export async function loadSource(target: string): Promise<RepoSource> {
  if ((FIXTURE_NAMES as readonly string[]).includes(target)) return loadFixture(target as FixtureName);
  if (!target.startsWith("http") && existsSync(target)) return loadLocalRepo(target);
  return loadGitHubRepo(target);
}
