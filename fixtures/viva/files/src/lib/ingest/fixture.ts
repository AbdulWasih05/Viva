/**
 * Reads a repo snapshot from fixtures/<name>/ (used by tests, evals and the offline demo).
 * FILES.tsv lists every file the real repo has; files/ holds the text files we snapshotted.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { RepoFile, RepoSource } from "./types";

/** "viva" is this repo itself, snapshotted with its Entire checkpoint data (the dogfood fixture). */
export const FIXTURE_NAMES = ["portfolio-new", "vidyut-mitra", "viva"] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

export function loadFixture(name: FixtureName, fixturesDir: string = path.resolve(process.cwd(), "fixtures")): RepoSource {
  const dir = path.join(fixturesDir, name);
  // Each line is "<size in bytes>\t<path>".
  const files: RepoFile[] = readFileSync(path.join(dir, "FILES.tsv"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("\t"))
    .map((line) => {
      const [size, filePath] = line.split("\t");
      return { path: filePath.trim(), size: Number(size) };
    });
  const known = new Set(files.map((file) => file.path));

  return {
    id: `fixture:${name}`,
    label: name,
    files,
    async readFile(filePath) {
      if (!known.has(filePath)) throw new Error(`Not a file in this fixture: ${filePath}`);
      return readFile(path.join(dir, "files", filePath), "utf8");
    },
  };
}
