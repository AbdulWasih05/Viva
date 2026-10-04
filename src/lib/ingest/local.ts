/** Reads a project from a folder on this machine. Only allowed when LOCAL_MODE=true. */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { RepoFile, RepoSource } from "./types";

// Folders that are never worth walking into (huge, generated, or private).
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".venv", "venv", "__pycache__", "target", ".viva"]);
const MAX_FILES = 5_000;

async function walk(root: string, dir: string, files: RepoFile[]): Promise<void> {
  if (files.length >= MAX_FILES) return;
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(root, relative, files);
    } else if (entry.isFile()) {
      // .env files hold secrets; they are never listed, so they can never be sent to a model.
      if (/^\.env(\..*)?$/.test(entry.name) && !entry.name.endsWith(".example")) continue;
      const info = await stat(path.join(root, relative));
      files.push({ path: relative, size: info.size });
    }
  }
}

/** Reads fixtures in tests and evals without needing LOCAL_MODE. */
export async function loadFolder(folder: string, id: string, label: string): Promise<RepoSource> {
  const root = path.resolve(folder);
  const files: RepoFile[] = [];
  await walk(root, "", files);
  const known = new Set(files.map((file) => file.path));
  return {
    id,
    label,
    files,
    async readFile(filePath) {
      if (!known.has(filePath)) throw new Error(`Not a file in this project: ${filePath}`);
      return readFile(path.join(root, filePath), "utf8");
    },
  };
}

export async function loadLocalRepo(folder: string): Promise<RepoSource> {
  if (process.env.LOCAL_MODE !== "true") {
    throw new Error("Local folders can only be read in local mode (LOCAL_MODE=true).");
  }
  const root = path.resolve(folder);
  // The id keeps the path as typed (not lower-cased) so it can be turned back into a folder on any OS.
  const source = await loadFolder(root, `local:${root.replaceAll("\\", "/")}`, path.basename(root));
  return { ...source, origin: { kind: "local", folder: root } };
}
