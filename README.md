# Viva

**A mock technical interview about your own project, for the AI-coding era.**

Students now ship projects an AI agent half-wrote, and interviewers know it. Viva reads your repo, finds the parts an agent wrote, and questions you about them the way a placement interviewer or a final-year viva panel would. It asks follow-ups based on what you actually said, remembers your weak spots, and ends with a scored report.

Built for the DEV Hacktoberfest 2026 Weekend Challenge (Build for a Friend). The interviewer is [Gemma](https://ai.google.dev/gemma), an open-weight model; [Mastra](https://mastra.ai) runs the agent; [Entire](https://entire.io) checkpoints tell Viva which code an AI wrote.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/AbdulWasih05/Viva)

## What it does

1. **Reads your project.** Paste a public GitHub URL (or, in local mode, a folder path). Viva picks the most telling files and Gemma writes a short brief. Every file path in that brief is checked against the real file list; invented ones are dropped.
2. **Finds the AI-written code.** If the repo has Entire checkpoints, Viva reads them: which commits came from an agent session, which files they changed, and the prompt that started it.
3. **Interviews you.** Overview, design decisions, a deep dive into the code, failure and scale, wrap-up. For code questions the interviewer agent opens files itself with a `readFile` tool. On AI-written code it says so: *"Your Entire session shows an AI agent wrote `src/auth.ts` (the prompt was: ...). How does the refresh work?"*
4. **Follows up on what you said.** Each follow-up must quote a phrase from your answer, and code checks the quote is really there.
5. **Scores and coaches.** Each answer gets 0 to 4 against a rubric. The report lists strengths, weak spots, what to revise, and five likely next questions. Scores are computed in code; Gemma writes the coaching text.
6. **Remembers (local mode).** Next session on the same repo opens with "Last time you struggled with X. Let's start there."

## Two modes, one codebase

| | Local mode | Hosted mode |
|---|---|---|
| Set with | `LOCAL_MODE=true` | `LOCAL_MODE=false` (Render) |
| Input | GitHub URL or a folder on your machine | Public GitHub URL, or a sample repo |
| Memory of weak spots | Yes, in a file on your machine (`.viva/memory.db`) | No. Nothing is stored |
| Model | Hosted Gemma, or Gemma on your own machine through Ollama | Hosted Gemma |
| Rate limit | None | Per IP |

## Run it locally

Needs Node 22.13 or newer and pnpm.

```bash
pnpm install
cp .env.example .env      # then fill in HOSTED_API_KEY
pnpm dev                  # http://localhost:3000
```

`HOSTED_API_KEY` is a free Google AI Studio key (aistudio.google.com). Set `LOCAL_MODE=true` in `.env` to allow folders and memory.

**Fully offline, with Gemma on your own machine:**

```bash
ollama pull gemma4:e4b
# in .env: LLM_PROVIDER=ollama and LOCAL_MODE=true
pnpm dev
```

Be warned: on the laptop this was built on (16 GB RAM, no usable GPU) local Gemma needed 50 seconds to several minutes per call, and could not finish a project brief within 15 minutes. Local mode is the privacy option for machines with a real GPU, not the default.

**Without a browser:**

```bash
pnpm interview portfolio-new                 # a bundled sample
pnpm interview https://github.com/you/repo tough 6
pnpm interview ./my-project friendly         # needs LOCAL_MODE=true
```

## Deploy your own (Render)

The button above creates one free web service from [`render.yaml`](render.yaml). Render asks for two values:

- `HOSTED_API_KEY`: your Google AI Studio key.
- `GITHUB_TOKEN` (optional, recommended): a token with no scopes. Without one, GitHub allows 60 API requests per hour per server, and reading one repo with checkpoints takes about 20.

A coding club can run its own private Viva this way, on its own key.

To keep the free instance awake, point an uptime monitor at `/api/health` every 5 minutes.

## Privacy

- **Hosted mode stores nothing.** The interview lives in your browser and is sent with each request. The server keeps no database, no sessions and no memory. It caches the file list of public repos for 30 minutes.
- **Local mode keeps everything on your machine.** With Ollama, your code and answers never leave it. Weak spots are saved to a local file, and "Forget this project" deletes them.
- **With hosted Gemma, your code excerpts and answers are sent to the model provider** (Google AI Studio by default). That is the trade-off for speed on a laptop without a GPU.
- **Logs hold metadata only:** how long a model call took and how many tokens it used. No prompts, no answers.
- **`.env` files are never read** from a local folder, so secrets in them cannot reach a model.

## Why open models

- **You can run it yourself.** The same code talks to Gemma on Google's servers or on your own machine; switching is one environment variable. A student with a private repo, or a college lab without reliable internet, is not locked out.
- **Free to practise.** No per-interview bill. The night before an interview you can run it as many times as the free quota allows.
- **Yours to change.** Prompts, personas and the scoring rubric are plain TypeScript in `src/lib/interview/prompts.ts`. Any club can deploy its own copy.
- **Honest limits.** A small open model on a student laptop is slow (numbers above), and the free hosted tier allows 16,000 input tokens per minute for everyone sharing a key. Viva paces its calls to stay inside that, so a busy instance gets slower rather than failing.

## How it is built

```
repo (GitHub / folder)
   -> ingest: pick files within a size budget            src/lib/ingest
   -> provenance: Entire checkpoints -> AI-written files  src/lib/provenance
   -> brief: Gemma writes it, code validates every path   src/lib/interview/brief.ts
   -> interview loop                                       src/lib/interview
        state machine (rounds, follow-up limit, skips)  -> plain functions
        questions about code                             -> Mastra agent + tools (src/mastra)
        scoring and follow-ups                           -> Gemma, checked with zod
   -> report: scores in code, coaching text by Gemma
   -> memory of weak spots (local mode)                    src/mastra/memory.ts
```

The rule throughout: **Gemma decides what to say; code decides what happens.** Round order, limits, scores and every file path are handled by plain, tested functions. Every model reply is checked with a zod schema, retried once, and replaced by a safe fallback if it is still wrong.

## What has been measured

Hosted `gemma-4-26b-a4b-it`, scripted interviews on two repos, 119 model calls (4 Oct 2026, `pnpm eval`):

- Structured output valid: 119 of 119 (1 needed the repair retry)
- Deep-dive questions that named a real file: 6 of 6
- Follow-ups whose quoted phrase was in the answer: 51 of 51
- The agent opened a file before asking a code question: 18 of 18
- A second session opened with last session's weak spot: 3 of 3 tries
- On this repo (which has Entire checkpoints): 3 of 3 interviews asked about AI-written code

A turn takes about 5 seconds when it ends in a follow-up and 11 to 14 seconds when it moves to a new main question. Full results are in `fixtures/evals/`, and the story behind each number is in `docs/PROGRESS.md`.

## Limitations

- "AI-written" means "changed in a commit that Entire linked to an agent session". Entire's per-line attribution was not usable on this repo, so Viva does not claim line-level proof.
- Tool activity ("reading src/auth.ts") is shown after a turn finishes, not live.
- There is no voice mode. It was planned and then cut to protect the core interview.
- The hosted demo shares one model key; two visitors at once will notice waits.

## Tracing (optional)

Set `SENTRY_DSN` and every interview turn is traced in Sentry: one span per turn with quality attributes (did the question name a real file, did the follow-up quote the answer, was the JSON repaired, was a fallback used), one per model call with token counts, one per file the agent read. Only numbers, true/false values and short labels are sent, never prompts or answers. Without a DSN, tracing is off.

Set `SENTRY_DEBUG_SPANS=true` as well to print those spans to the server log.

## Development

```bash
pnpm typecheck    # types
pnpm lint         # eslint
pnpm test         # unit tests (no model needed)
pnpm eval         # scripted interviews against fixtures, prints quality metrics
pnpm build        # production build
```

Design decisions are recorded with their reasons in [`docs/DECISIONS.md`](docs/DECISIONS.md); the requirements are in [`docs/PRD.md`](docs/PRD.md).

## Challenge note

All work in this repository was done inside the challenge window (from 2 October 2026). Any commit made after the submission deadline (5 October 2026, 06:59 UTC) will be listed here.
