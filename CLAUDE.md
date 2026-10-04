# CLAUDE.md

Guidance for Claude Code working in this repository. Read this file fully at the start of every session.

## What this project is

**Viva** is an AI interview coach for the AI-coding era. It reads your project (a GitHub repo or a local folder), finds out which parts an AI agent wrote (from Entire checkpoints, when present), and runs a mock technical interview about it, the way a placement interviewer or a final-year viva panel would. It asks follow-ups based on what you actually said, can open more files mid-interview, remembers your weak spots across sessions, coaches how you speak as well as what you say, and ends with a scored report.

One line pitch: *students now ship projects an AI half-wrote, and interviewers know it. Viva makes sure you understand what you shipped.*

Built for the DEV **Hacktoberfest 2026 Weekend Challenge: Build for a Friend**. Prompt: build something with open-source AI at its core that solves a real problem for a friend. Gemma (open-weight) is the brain and must be what makes the project work.

- Builder: Abdul Wasih (final-year CSE student, strong in TypeScript)
- The friend: [FRIEND_NAME], a batchmate heading into placements (details in `docs/PRD.md` section 2)
- Requirements: `docs/PRD.md`
- Work plan and task status: `docs/PHASES.md`

## Hard deadline

**Submissions close Monday 5 Oct 2026, 12:29 PM IST (06:59 UTC).** Internal target: post published by **10:00 AM IST Monday**. The scope is ambitious on purpose. When behind, follow the **cut order** in `docs/PHASES.md` exactly; never cut the core interview, Mastra, or Entire provenance.

Challenge rules that affect the code:
- The repo and all work must start and finish inside the challenge window (from Oct 2). Any commit after the deadline must be noted in the README.
- Open-source AI must be at the core. Gemma is the brain; Mastra (open source) orchestrates; partner tools are supporting layers.

## Target prize categories (every feature should serve one)

| Category | Prize | What Viva does with it |
|---|---|---|
| Gemma (featured) | $200 | The interviewer brain: Gemma 4 26B hosted for the demo, Gemma 4 E4B on Ollama for fully offline use; the two are benchmarked against each other |
| Render (featured) | $200 | Agent frontend and API as a web service, one-click "Deploy to Render" blueprint |
| Mastra | $100 | Interviewer agent with tools (readFile, provenance lookup) and cross-session memory of weak spots |
| Entire | $100 | Viva reads Entire checkpoints to question AI-written code; the post explains Viva's own code via `entire explain` |
| ElevenLabs | $100 | Voice interviews with personas, speech-to-text with timestamps for delivery coaching |
| Sentry Agent Tracing | $100 | Traces every agent step with quality attributes (made-up file rate, JSON repair rate, follow-up grounding) |

## The working loop (follow this every session)

1. **Orient.** Read `docs/PHASES.md` and the latest entries in `docs/PROGRESS.md`. Pick the first unchecked task in the earliest incomplete phase, unless the user says otherwise.
2. **Research.** If the task touches an external API, SDK, model, or service, read current docs before writing code. Do not trust memory for package names, model tags, endpoints, CLI output formats, or SDK signatures. Record surprises in `docs/DECISIONS.md`.
3. **Ideate.** For any non-trivial task, list 2 or 3 options in a line each and pick the simplest that meets the PRD. Prefer boring and explainable over clever.
4. **Plan.** Write the subtasks (as sub-checkboxes in `PHASES.md` if they are new). Each must be verifiable on its own.
5. **Build.** One subtask at a time, on a branch for the phase (for example `phase-1-core-engine`). One commit per phase with a clear message, pushed as a pull request; Wasih reviews and squash-merges. Never push to `main` directly.
6. **Verify.** Typecheck, lint, tests, and the eval script where relevant. For UI, run the app and walk the flow. Done means verified.
7. **Log.** Tick the box in `PHASES.md`. Append 2 to 4 lines to `docs/PROGRESS.md` (what changed, how verified, anything for the post). Architecture choices go to `docs/DECISIONS.md` with a one-line reason.
8. **Loop.** Stop and ask the user when a decision changes scope, costs money, or needs an account or API key.

## Rules for working with Wasih

- **He must be able to explain every line.** He writes the DEV post and may be interviewed about this project (by Viva itself, in the demo). Keep code simple, typed, and commented where the reasoning is not obvious.
- After each phase, give a 3 to 6 bullet plain-language "How it works" summary and add it to `PROGRESS.md`.
- Collect post material as you go: real numbers, bugs and fixes, moments where Gemma surprised you. Tag those lines `[POST]`. When a fix has an interesting reason (for example, Gemma invented a file path), tag it `[WHY]`; these become the "why this code exists" section using `entire explain`.
- Never invent metrics. Only report measured numbers and say how they were measured.
- Do not write the final DEV post. Phase 10 produces an outline, notes, and assets; the writing is his.
- Secrets: the repo is public and Entire checkpoints are pushed with it, so session transcripts are public. Never paste API keys, passwords, or personal data into a session. Keys live only in `.env`.

## Tech stack (decided; change only via DECISIONS.md)

- **Framework:** Next.js (App Router) + TypeScript (strict), pnpm, Tailwind CSS
- **Agent orchestration:** Mastra (TypeScript). The interviewer is a Mastra agent with tools and memory. Deterministic logic (state machine, scoring math, path validation) stays in plain functions the agent calls.
- **Model access:** Mastra's built-in model router (see DECISIONS D1, D24 to D27), pointed at:
  - **Hosted (default for development, evals and the demo):** Gemma 4 26B on Google AI Studio via Google's native API, `model: { id: "google/gemma-4-26b-a4b-it", apiKey }` with `thinkingLevel: "minimal"`; OpenRouter `google/gemma-4-26b-a4b-it:free` (OpenAI-compatible) as documented fallback
  - **Local (offline / private option):** Ollama's OpenAI-compatible endpoint, `model: { id: "ollama/gemma4:e4b", url }` (the laptop has 16 GB RAM and an MX130, so it runs mostly on CPU: 50 s or more per call)
  - Structured output uses `jsonPromptInjection: true`; every hosted call has a 30 s timeout and one retry
- **Validation:** zod for every structured output, one repair retry, then a safe fallback
- **Memory:** Mastra memory with local file storage (for example LibSQL) in local mode only; hosted mode keeps no memory (privacy)
- **Repo ingestion:** GitHub REST API (optional `GITHUB_TOKEN`) and local folder reading in local mode
- **Provenance:** Entire checkpoints read from the target repo (git refs in local mode, GitHub API in hosted mode; confirm format in Phase 0)
- **Voice:** ElevenLabs TTS (persona voices) and ElevenLabs speech-to-text with word timestamps (delivery metrics). Text mode always works without voice.
- **Observability:** Sentry for Next.js; prefer its AI SDK / agent integration for automatic LLM spans, plus custom attributes for interview quality
- **Hosting:** Render blueprint (`render.yaml`): one web service that calls the hosted Gemma endpoint (no private Ollama service, DECISIONS D6); a `/api/health` route pinged every 5 minutes keeps the free instance awake (D7)
- **Testing:** Vitest; `pnpm eval` runs the agent against fixture repos and prints quality metrics

## Project layout (target)

```
src/
  app/                       Next.js routes and pages
    api/ingest/route.ts      repo -> ProjectBrief (+ provenance)
    api/turn/route.ts        one interview turn
    api/report/route.ts      final report
    api/tts/route.ts         ElevenLabs TTS
    api/stt/route.ts         ElevenLabs STT + delivery metrics
  mastra/
    index.ts                 Mastra instance
    agents/interviewer.ts    the interviewer agent (instructions per persona)
    tools/                   readFile, listFiles, getProvenance, recallWeakSpots, saveWeakSpots
  lib/
    llm/                     model provider setup, zod structured-output helpers
    ingest/                  GitHub + local readers, file selection, token budget
    provenance/              Entire checkpoint reader -> AI-authored map
    interview/               state machine, prompts, schemas, scoring (pure functions)
    delivery/                filler words, pauses, pace from STT timestamps
    tracing/                 Sentry helpers and quality attributes
  components/
fixtures/                    repo snapshots (incl. one with Entire checkpoints) for evals and offline demo
scripts/                     eval.ts, interview.ts (CLI), bench-models.ts
render.yaml
docs/                        PRD, PHASES, PROGRESS, DECISIONS, post/
```

## Commands

Keep accurate. Needs Node >= 22.13 (Mastra) and pnpm.

```
pnpm dev          # next dev, http://localhost:3000
pnpm build        # next build
pnpm start        # serve the production build
pnpm typecheck    # next typegen && tsc --noEmit (typegen creates Next's route and layout types first)
pnpm lint         # eslint
pnpm test         # vitest run
pnpm eval         # scripted interviews against the fixtures, prints quality metrics: `pnpm eval` or `pnpm eval portfolio-new`
pnpm interview    # terminal interview: `pnpm interview <fixture | github url | folder> [friendly|tough] [5-12]`
pnpm bench        # model benchmark, reads .env: `pnpm bench hosted 5` or `pnpm bench ollama 3`
```

## Environment variables

Keep `.env.example` in sync. Never commit real keys.

```
LLM_PROVIDER=hosted|ollama # hosted is the default
HOSTED_API_KEY=            # Google AI Studio key
HOSTED_MODEL=gemma-4-26b-a4b-it
HOSTED_BASE_URL=           # empty for Google; set only for an OpenAI-compatible fallback (OpenRouter)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=gemma4:e4b
GITHUB_TOKEN=              # optional
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_FRIENDLY=
ELEVENLABS_VOICE_TOUGH=
SENTRY_DSN=
LOCAL_MODE=true|false      # local folders + memory; must be false on Render
MEMORY_DB_PATH=.viva/memory.db
```

## Code conventions

- TypeScript strict, no `any` without a comment.
- Prompts and persona instructions live in `src/lib/interview/prompts.ts` and `src/mastra/agents/` as readable template functions, easy to quote in the post.
- Every model call goes through the shared provider setup so tracing and provider switching happen in one place.
- Every structured output is parsed with zod. Never let bad model output crash the UI.
- Any file path or line range the model mentions is validated against the real repo before it reaches the user.
- API routes stay thin; logic lives in `src/lib` and `src/mastra`.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`), plus any attribution lines the environment asks for.

## Definition of done

- A judge opens the Render URL, pastes a public repo, and completes a 6 to 10 question interview with a report, in text mode, without errors.
- On a repo with Entire checkpoints, Viva asks at least one question about AI-written code and says so ("your session shows the agent wrote this").
- Locally, a second session on the same repo opens by retesting last session's weak spots (Mastra memory).
- Voice mode works and the report includes delivery feedback (filler words, pauses, pace).
- Sentry shows traced agent turns with quality attributes; screenshots are in `docs/post/`.
- README covers both modes, the Deploy to Render button, privacy notes, and why open models matter.
- `docs/post/` has the outline, demo video, narration, screenshots, traces, `entire explain` excerpts, and the friend's feedback.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
