# PROGRESS

Short log, newest at the bottom. `[POST]` = material for the DEV post. `[WHY]` = a fix with an interesting reason.

## 4 Oct 2026: Phase 0.1 and 0.2 (scaffold, session capture)

- Scaffolded Next.js 16.3.8 (App Router, TypeScript strict, Tailwind 4, ESLint) with pnpm; added zod 4, Vitest 5, tsx. Moved `PRD.md` and `PHASES.md` into `docs/`.
- Enabled Entire (CLI 0.11.3) for Claude Code before the first commit, so the scaffold commit is linked to its session.
- Plan review changed the architecture before any code: hosted Gemma 4 31B is the main model, local `gemma4:e4b` is for the offline clip and a small benchmark. See DECISIONS D1 to D9.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm dev` (HTTP 200) and `pnpm test` pass. Tests needed the Node upgrade from 22.11.0 to 22.23.2: Vitest's native binding requires Node >= 22.12 and was silently skipped at install.
- Note: the "31B is the main model" line above was the plan at that point; measurements later the same day changed it to 26B (next section).
- Pulled `gemma4:e4b` (6.6 GB on disk, Q4_K_M, `ollama show` lists tools, vision, audio, thinking; thinking is on by default).
- `[POST]` First local speed measurement, one run of `ollama run gemma4:e4b --verbose --think=false` with a 22-token prompt on this laptop (15.9 GB RAM, MX130), Ollama's default 4096 context: cold model load 2 min 9 s, prompt read at 3.15 tokens/s, answer generated at 2.93 tokens/s (51 tokens in 17.4 s). At that prompt speed a 2,000-token repo brief would take about 10 minutes just to read in, which confirms D1. (`ollama ps` reported "266 MB, 100% GPU", which does not look right for a 6.6 GB model; not investigated.)
- Entire spike (0.5) done on our own first checkpoint; format in DECISIONS D18 to D23. Verified by reading the ref with git and again through the GitHub API.
- `[POST]` `[WHY]` The checkpoint's `prompt.txt` was a background-task notification, not something Wasih typed. The provenance reader has to skip system-generated prompts and find the last real user message.
- `[POST]` Provenance is file-level: Entire stores how many lines the agent wrote per commit (for example 100% of 2 lines), not which lines.
- `[POST]` Privacy lesson on day one: the first public transcript included an email address from the session context. Turned on Entire's PII redaction for all later checkpoints.
- `[POST]` The plan assumed Gemma 3; research found Gemma 4 is current and lists tool calling on Ollama, which Gemma 3 did not.
- `[POST]` Honest trade-off: a 16 GB laptop with an MX130 cannot run interview turns on local Gemma at a usable speed, so local mode is a privacy option, not the default. Measured numbers to follow in 0.3 and 0.7.

## 4 Oct 2026: Phase 0.3 to 0.8 (hosted model, Mastra spike, benchmark, fixtures)

All numbers below were measured on 4 Oct 2026 from this laptop with the scripts named; sample sizes are small and stated.

- `[POST]` **Why not Gemma 4 31B.** Raw `fetch` calls to Google AI Studio with `gemma-4-31b-it`, 13 calls in total: 7 returned HTTP 500 "Internal error encountered" (3 of 3 calls that sent a system message on the OpenAI-compatible URL, 1 JSON-schema call there, and 3 of 6 on the native API). The 6 that answered took 9.0, 18.1, 24.8, 27.2, 46.1 and 51.5 s. Thinking could not be switched off on the OpenAI-compatible URL (`reasoning_effort` returned HTTP 400 "not supported for this model") and the thoughts came back inside the answer as `<thought>` text.
- `[POST]` **Why Gemma 4 26B.** `gemma-4-26b-a4b-it` on the native API with `thinkingLevel: "minimal"`: system prompt + JSON schema in 2.1 s, tool call in 1.3 s, plain question in 1.3 s (1 call each).
- `[POST]` **Mastra spike, hosted 26B** (`scripts/spikes/mastra.ts hosted 5`, 5 runs per check): plain generate 5/5 (median 1.3 s), `readFile` tool call 5/5 (median 3.1 s), structured output with the schema in the prompt 5/5 (median 3.4 s).
- `[POST]` `[WHY]` **The 5-minute hang.** With Google's native JSON-schema mode, at least 4 of 15 structured-output calls got no response at all: two measured at 308 s each (Node's default fetch timeout is 300 s) before the SDK's retry succeeded, at least one more in an earlier run that took over 4 minutes but did not print per-run times, and one cut off by our 30 s timeout. The slow calls still "passed" and the median still read 2 s. Only printing every run's time exposed it. Fix: schema-in-prompt mode plus a 30 s timeout on every hosted call (DECISIONS D25, D26).
- `[POST]` **Mastra spike, local `gemma4:e4b`** (`scripts/spikes/mastra.ts ollama 1`, 1 run per check, Ollama default 4096 context, thinking left on): plain generate passed in 50 s, tool call passed in 85 s, structured output passed in 210 s (native) and 544 s (schema in prompt). It works; it is roughly 30 to 160 times slower than hosted on the same checks.
- **Memory:** Mastra memory on LibSQL saved weak spots through a Next.js route and read them back after a server restart, under `next dev` and under `next build` + `next start` (DECISIONS D28). `[WHY]` The first production build failed on a type error in the spike script and warned about a dynamic path; both would have been missed by testing with a script only.
- **Benchmark, hosted 26B** (`pnpm bench hosted 5`; input: the `portfolio-new` fixture's file list, README and package.json, 3,481 characters, 37 files): brief prompt valid 5/5, all 15 of 15 file paths named were real, median 6.8 s (6.8 to 8.2 s); question prompt valid 5/5, 5 of 5 real files, median 3.5 s (3.3 to 3.8 s).
- **Benchmark, local `gemma4:e4b`:** not recorded yet. `[POST]` The first attempt ran while the laptop went to sleep for about two and a half hours, so its timings (up to 186 minutes for one call) measured the nap, not the model, and were thrown away. Rerun started on the morning of 4 Oct.
- **Fixtures:** `fixtures/vidyut-mitra` (94 tracked files, 85 snapshotted) and `fixtures/portfolio-new` (70 tracked, 40 snapshotted), both Wasih's public repos; scanned for key-like strings, none found.
- **How it works (Phase 0, plain language):**
  - The app is a Next.js project. Nothing user-facing exists yet; Phase 0 only proved the risky parts.
  - A Mastra "agent" is a wrapper around a model plus tools. We give it a model address: Google's hosted Gemma 4 26B by default, or the Gemma running in Ollama on the laptop. Swapping is one env variable.
  - A "tool" is a normal TypeScript function the model may ask to run (here `readFile`). Gemma decides when to call it; our code does the reading.
  - For structured answers we describe the JSON shape in the prompt, then check the reply with a zod schema. If the shape is wrong, the code knows immediately instead of crashing later.
  - Memory is a small SQLite-style file (`.viva/memory.db`) written by plain code through Mastra's memory API; it survives restarts.
  - Entire saves each coding session as a git ref next to the commit it produced. Viva will read those refs to learn which files the agent wrote and what it was asked to do.
- **Git:** `main` was rewritten once to drop attribution trailers and the one public checkpoint ref with an email address was deleted (DECISIONS D15a). Work now goes through one PR per phase.
