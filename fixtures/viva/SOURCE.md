# Fixture: viva (this repository)

- Source: https://github.com/AbdulWasih05/Viva
- Commit: 79b8b6e16c4c66ef2fa5835b50497b462177cfca
- Snapshot date: 2026-10-04
- `FILES.tsv`: every tracked file outside `fixtures/` with its size in bytes
- `files/`: text files of at most 70 KB
- `checkpoints.json`: Entire checkpoint data as extracted by `src/lib/provenance/local.ts` (metadata, linked commits, human prompts; no transcripts)
- Regenerate with `pnpm tsx scripts/snapshot-viva.ts`
