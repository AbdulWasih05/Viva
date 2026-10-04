/**
 * File selection: pick the files that tell an interviewer the most about a project,
 * within a size budget the model can read quickly.
 *
 * Pure functions, no I/O, so the heuristic is easy to test and to explain.
 */
import type { FileContent, RepoFile, RepoSource, SelectedFile } from "./types";

/**
 * Total characters of file content sent to the model for the brief (about 6k tokens).
 * Sized for Google's free tier, which allows 16,000 input tokens per minute for Gemma 4 26B:
 * the brief must fit in one request and leave room for the first questions.
 */
export const BRIEF_BUDGET_CHARS = 24_000;
/** No single file may use more than this, so one big file cannot crowd out the rest. */
export const PER_FILE_CAP_CHARS = 4_000;
/** Files larger than this are almost always generated or data, not hand-written code. */
const MAX_FILE_BYTES = 200_000;

const IGNORED_DIRS = [
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", "vendor",
  "__pycache__", ".venv", "venv", "target", ".idea", ".vscode", "public", "assets", "static",
];

const IGNORED_FILES = [
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "poetry.lock", "Cargo.lock",
  "next-env.d.ts", ".gitignore", ".DS_Store",
];

const BINARY_EXTENSIONS = /\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|tar|woff2?|ttf|eot|mp3|mp4|mov|lockb|pyc|exe|dll|so|bin)$/i;
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|py|go|rs|java|kt|rb|php|cs|c|cpp|h|swift|sql|prisma)$/i;

const MANIFESTS = ["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "pom.xml", "build.gradle", "Gemfile"];
const ARCHITECTURE_FILES = ["docker-compose.yml", "docker-compose.yaml", "Dockerfile", "render.yaml", "schema.sql", "schema.prisma", ".env.example", "vercel.json", "netlify.toml"];
const ENTRY_POINTS = /^(app|main|index|server|manage|wsgi|asgi)\.(py|ts|tsx|js|jsx|go|rs)$|^App\.(tsx|jsx)$|^(page|layout|route)\.(tsx|ts)$/;

export function estimateTokens(chars: number): number {
  // Rough rule of thumb for English text and code: about 4 characters per token.
  return Math.ceil(chars / 4);
}

export function isIgnored(file: RepoFile): boolean {
  const parts = file.path.split("/");
  const name = parts[parts.length - 1];
  if (parts.slice(0, -1).some((dir) => IGNORED_DIRS.includes(dir))) return true;
  if (IGNORED_FILES.includes(name)) return true;
  if (BINARY_EXTENSIONS.test(name)) return true;
  if (/\.min\.(js|css)$/.test(name)) return true;
  if (file.size === 0 || file.size > MAX_FILE_BYTES) return true;
  return false;
}

/** Hand-written program code: not ignored, not a test, and a code file extension. Used to pick AI-written files worth asking about. */
export function isSourceFile(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  const isTest = /(^|\/)(tests?|__tests__|spec|fixtures|scripts\/spikes)\//.test(path) || /\.(test|spec)\.[a-z]+$/.test(name) || /^test_/.test(name);
  // Size is unknown here; 1 stands in for "not empty" so only the path rules of isIgnored apply.
  const isToolConfig = /\.config\.(m?js|c?js|m?ts)$/.test(name); // eslint.config.mjs, next.config.ts, ...
  return !isTest && !isToolConfig && CODE_EXTENSIONS.test(name) && !isIgnored({ path, size: 1 });
}

/** Higher score = more useful to an interviewer. Returns the score and a short reason. */
export function scoreFile(file: RepoFile): { score: number; reason: string } {
  const parts = file.path.split("/");
  const name = parts[parts.length - 1];
  const depth = parts.length - 1;
  const isTest = /(^|\/)(tests?|__tests__|spec)\//.test(file.path) || /\.(test|spec)\.[a-z]+$/.test(name) || /^test_/.test(name);

  if (/^readme(\.md)?$/i.test(name) && depth === 0) return { score: 100, reason: "README" };
  if (MANIFESTS.includes(name)) return { score: 90 - depth, reason: "manifest (dependencies and scripts)" };
  if (ARCHITECTURE_FILES.includes(name)) return { score: 80 - depth, reason: "architecture config" };
  if (isTest) return { score: 10, reason: "test" };
  if (ENTRY_POINTS.test(name)) return { score: 70 - depth, reason: "entry point" };
  if (CODE_EXTENSIONS.test(name)) {
    // Central files tend to be larger and closer to the root.
    const sizeBonus = Math.min(file.size / 1000, 20);
    return { score: 40 + sizeBonus - depth * 2, reason: "source file" };
  }
  if (/\.(md|mdx|txt)$/i.test(name)) return { score: 15, reason: "documentation" };
  if (/\.(json|ya?ml|toml|ini|cfg)$/i.test(name)) return { score: 12, reason: "config" };
  return { score: 5, reason: "other" };
}

/**
 * Chooses files in score order until the budget is used up.
 * A file counts for at most `perFileCap` characters because that is all the model will see of it.
 */
export function selectFiles(
  files: RepoFile[],
  budgetChars: number = BRIEF_BUDGET_CHARS,
  perFileCap: number = PER_FILE_CAP_CHARS,
): SelectedFile[] {
  const ranked = files
    .filter((file) => !isIgnored(file))
    .map((file) => ({ ...file, ...scoreFile(file) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const selected: SelectedFile[] = [];
  let used = 0;
  for (const file of ranked) {
    const cost = Math.min(file.size, perFileCap);
    if (used + cost > budgetChars) continue;
    selected.push(file);
    used += cost;
  }
  return selected;
}

/** Reads the selected files, cutting each to the per-file limit. */
export async function loadContents(
  source: RepoSource,
  selected: RepoFile[],
  perFileCap: number = PER_FILE_CAP_CHARS,
): Promise<FileContent[]> {
  const contents: FileContent[] = [];
  for (const file of selected) {
    try {
      const text = await source.readFile(file.path);
      contents.push({ path: file.path, content: text.slice(0, perFileCap), truncated: text.length > perFileCap });
    } catch {
      // A file that cannot be read (deleted, binary, network error) is skipped, not fatal.
    }
  }
  return contents;
}
