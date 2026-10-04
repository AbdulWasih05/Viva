/**
 * Dogfood fixture: snapshots this repo (Viva itself) together with its Entire checkpoint data
 * into fixtures/viva/, so evals and the offline demo can question Wasih about code his agent wrote.
 *
 *   pnpm tsx scripts/snapshot-viva.ts
 *
 * Writes:
 *   fixtures/viva/FILES.tsv         every tracked file with its size
 *   fixtures/viva/files/            text files up to 70 KB (no fixtures, lockfiles or binaries)
 *   fixtures/viva/checkpoints.json  what the provenance reader extracted from the checkpoints:
 *                                   checkpoint metadata, linked commits with their files, and the
 *                                   human prompts. Transcripts themselves are not copied.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readLocalCheckpoints } from "../src/lib/provenance/local";
import { provenanceFromInput } from "../src/lib/provenance";

const OUT = "fixtures/viva";
const MAX_BYTES = 70_000;
const SKIP = /^(fixtures\/|pnpm-lock\.yaml$)|\.(png|jpe?g|webp|gif|ico|pdf|svg|woff2?|ttf)$/i;

async function main() {
  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const tracked = git(["ls-files"]).split("\n").filter(Boolean);
  const sha = git(["rev-parse", "HEAD"]).trim();

  const rows: string[] = [];
  let copied = 0;
  for (const file of tracked) {
    if (file.startsWith("fixtures/")) continue; // a fixture never contains the fixtures folder
    const size = statSync(file).size;
    rows.push(`${size}\t${file}`);
    if (SKIP.test(file) || size === 0 || size > MAX_BYTES) continue;
    const target = path.join(OUT, "files", file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(file, target);
    copied += 1;
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "FILES.tsv"), `${rows.join("\n")}\n`);

  const input = await readLocalCheckpoints(".");
  writeFileSync(path.join(OUT, "checkpoints.json"), JSON.stringify(input, null, 2));

  const filePaths = rows.map((row) => row.split("\t")[1]);
  const { provenance } = provenanceFromInput(input, filePaths);

  writeFileSync(
    path.join(OUT, "SOURCE.md"),
    [
      "# Fixture: viva (this repository)",
      "",
      "- Source: https://github.com/AbdulWasih05/Viva",
      `- Commit: ${sha}`,
      `- Snapshot date: ${new Date().toISOString().slice(0, 10)}`,
      "- `FILES.tsv`: every tracked file outside `fixtures/` with its size in bytes",
      "- `files/`: text files of at most 70 KB",
      "- `checkpoints.json`: Entire checkpoint data as extracted by `src/lib/provenance/local.ts` (metadata, linked commits, human prompts; no transcripts)",
      "- Regenerate with `pnpm tsx scripts/snapshot-viva.ts`",
      "",
    ].join("\n"),
  );

  console.log(`tracked ${rows.length}, copied ${copied}`);
  console.log(`checkpoints ${input.checkpoints.length}, linked commits ${input.commits.length}, sessions ${Object.keys(input.promptsBySession).length}`);
  for (const checkpoint of input.checkpoints) {
    console.log(`  ${checkpoint.id}: files_touched=${checkpoint.filesTouched.length} agent_lines=${checkpoint.agentLines} pct=${checkpoint.agentPercentage.toFixed(2)}`);
  }
  for (const [session, prompts] of Object.entries(input.promptsBySession)) {
    console.log(`  session ${session.slice(0, 8)}: ${prompts.length} human prompts`);
  }
  console.log(`AI-authored source files: ${new Set(provenance.map((entry) => entry.path)).size} (${provenance.length} entries)`);
  for (const entry of provenance.slice(0, 6)) console.log(`  ${entry.path} <- ${entry.commit} [${entry.source}] "${entry.promptSummary.slice(0, 90)}"`);
}

main();
