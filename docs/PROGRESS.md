# PROGRESS

Short log, newest at the bottom. `[POST]` = material for the DEV post. `[WHY]` = a fix with an interesting reason.

## 4 Oct 2026: Phase 0.1 and 0.2 (scaffold, session capture)

- Scaffolded Next.js 16.3.8 (App Router, TypeScript strict, Tailwind 4, ESLint) with pnpm; added zod 4, Vitest 5, tsx. Moved `PRD.md` and `PHASES.md` into `docs/`.
- Enabled Entire (CLI 0.11.3) for Claude Code before the first commit, so the scaffold commit is linked to its session.
- Plan review changed the architecture before any code: hosted Gemma 4 31B is the main model, local `gemma4:e4b` is for the offline clip and a small benchmark. See DECISIONS D1 to D9.
- `[POST]` The plan assumed Gemma 3; research found Gemma 4 is current and lists tool calling on Ollama, which Gemma 3 did not.
- `[POST]` Honest trade-off: a 16 GB laptop with an MX130 cannot run interview turns on local Gemma at a usable speed, so local mode is a privacy option, not the default. Measured numbers to follow in 0.3 and 0.7.
