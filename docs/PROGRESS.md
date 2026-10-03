# PROGRESS

Short log, newest at the bottom. `[POST]` = material for the DEV post. `[WHY]` = a fix with an interesting reason.

## 4 Oct 2026: Phase 0.1 and 0.2 (scaffold, session capture)

- Scaffolded Next.js 16.3.8 (App Router, TypeScript strict, Tailwind 4, ESLint) with pnpm; added zod 4, Vitest 5, tsx. Moved `PRD.md` and `PHASES.md` into `docs/`.
- Enabled Entire (CLI 0.11.3) for Claude Code before the first commit, so the scaffold commit is linked to its session.
- Plan review changed the architecture before any code: hosted Gemma 4 31B is the main model, local `gemma4:e4b` is for the offline clip and a small benchmark. See DECISIONS D1 to D9.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` pass; first commit pushed to `main`. Not yet verified: `pnpm test` (Vitest's native binding is skipped on Node 22.11, needs >= 22.13; a winget upgrade attempt failed with installer error 1603) and an Entire checkpoint (the hooks only load in a new Claude Code session).
- Pulled `gemma4:e4b` (6.6 GB on disk, Q4_K_M, `ollama show` lists tools, vision, audio, thinking; thinking is on by default).
- `[POST]` First local speed measurement, one run of `ollama run gemma4:e4b --verbose --think=false` with a 22-token prompt on this laptop (15.9 GB RAM, MX130), Ollama's default 4096 context: cold model load 2 min 9 s, prompt read at 3.15 tokens/s, answer generated at 2.93 tokens/s (51 tokens in 17.4 s). At that prompt speed a 2,000-token repo brief would take about 10 minutes just to read in, which confirms D1. (`ollama ps` reported "266 MB, 100% GPU", which does not look right for a 6.6 GB model; not investigated.)
- `[POST]` The plan assumed Gemma 3; research found Gemma 4 is current and lists tool calling on Ollama, which Gemma 3 did not.
- `[POST]` Honest trade-off: a 16 GB laptop with an MX130 cannot run interview turns on local Gemma at a usable speed, so local mode is a privacy option, not the default. Measured numbers to follow in 0.3 and 0.7.
