# Post outline

An outline and pointers only. The writing is Wasih's. Tags: `devchallenge`, `weekendchallenge`, `hf26challenge`.

Every number below is copied from `docs/PROGRESS.md`; the full tagged list is in `notes.md`. Items marked **TODO (Wasih)** need something only he has.

## What I Built

- The friend: **TODO (Wasih)** name, project, the moment they froze (PRD section 2 is still a placeholder).
- The angle: students ship projects an AI half-wrote, and interviewers probe exactly those parts.
- One-paragraph description of Viva (README, "What it does", has the six steps).
- Screenshot: `ui-1-start.jpg`.

## Demo

- **TODO (Wasih)** video at the top; live Render URL (not deployed yet).
- Scenes worth showing, each already working in the app:
  1. Paste a repo, brief with the AI-written areas panel (`ui-2-brief.jpg`, `ui-3-brief-ai-areas.jpg`).
  2. The question that opens with "Your Entire session shows an AI agent wrote ..." (example text in `notes.md`, Phase 3).
  3. A follow-up that quotes the answer; the line "Before asking, Viva was reading src/mastra/index.ts".
  4. Report, then a second session opening with "Last time you struggled with ..." (local mode).
  5. Dogfood: Viva interviewing Wasih about Viva.
- Scenes that are NOT available: voice answers and delivery feedback (cut), and a full interview on local Gemma with Wi-Fi off (the laptop cannot finish a brief locally; see "honest trade-offs").

## Code

- Repo embed, Deploy to Render button (in the README).
- Architecture sketch: the block in the README under "How it is built".
- The one design rule: Gemma decides what to say; code decides what happens.

## How I Built It (one specific detail and one real number per partner)

- **Gemma.** Planned Gemma 3, found Gemma 4. Chose hosted 26B over 31B on evidence: 31B failed 7 of 13 calls and took 9 to 52 s; 26B answered in 1.3 to 2.1 s. Eval: 119 of 119 valid structured outputs.
- **Mastra.** One registered agent, repo passed per request, `readFile` tool that refuses invented paths. The agent opened a file before 18 of 18 code questions. Memory: 3 of 3 second sessions opened with last time's weak spot.
- **Entire.** Viva reads checkpoint refs and commit trailers. Dogfood eval: 3 of 3 interviews asked about AI-written code. Honest twist: Entire's attribution credited a human, and `prompt.txt` held a machine message, so Viva uses commit-level provenance and digs the prompt out of the transcript.
- **Sentry.** One span per turn with quality attributes (real file named, follow-up quotes the answer, repair used, fallback used). **TODO (Wasih)** screenshots once a DSN is set.
- **Render.** One free web service, no database; per-IP rate limit. **TODO** deploy and measure.
- **ElevenLabs.** Narration of the video only. Say plainly that voice in the app was cut.

## Why Does Open Innovation Matter?

- Same code runs against hosted Gemma or Gemma on your own machine; one env variable.
- Private repos and college labs: local mode keeps code and answers on the laptop.
- Any club can deploy its own copy on its own key.
- **Honest trade-offs (these make the post credible):**
  - Local Gemma on a 16 GB laptop with no usable GPU: 50 to 544 s per call, and 0 of 3 briefs finished in 15 minutes.
  - Free hosted tier: 16,000 input tokens per minute, shared by all visitors.
  - Turns take 11 to 14 s when moving to a new main question (target was 8).

## Why this code exists (three stories, each with its code and its checkpoint)

Excerpts from `entire checkpoint explain --short` are in `docs/post/entire/`. Their "Summary" sections are empty until someone runs `entire checkpoint explain --generate <id>`.

1. **The interview that ran on a fake brief** (Phase 1). Code: `src/lib/llm/pacing.ts`, the `fallback=true` line in `scripts/eval.ts`. Checkpoint `01M42JD451BYV1GWSZGCGR7XW8`.
2. **`prompt.txt` was a machine message** (Phase 3). Code: `cleanPrompt` and `pickPrompt` in `src/lib/provenance/parse.ts`. Checkpoint `01M42NWD277RKX9H1T8H9F0KGY`.
3. **The two-minute turns** (Phase 4). Code: `MAX_TOOL_CALLS` in `src/mastra/tools/repo.ts`, plan B in `askMainQuestion` (`src/lib/interview/turn.ts`). Checkpoint `01M42QVB4XE6RDXH9JF7891SJE`.

## My Agent Session

- **TODO (Wasih)** DevRelay was skipped; either link the public Entire checkpoints or upload a session at dev.to/agent_sessions/new.

## Handing it over

- **TODO (Wasih)** the friend's exact words, with permission; what was useful, what felt fake, would they use it.

## Prize Categories

Gemma, Render, Mastra, Entire, ElevenLabs, Sentry Agent Tracing. For ElevenLabs and Sentry, describe only what was actually done.

## Before publishing

- [ ] Every number matches `docs/PROGRESS.md`.
- [ ] Live URL works from a fresh browser.
- [ ] The README's challenge note lists any commit made after the deadline.
