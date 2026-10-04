# DECISIONS

Architecture choices and research surprises, newest at the bottom. One line of reason each. Items marked "unverified" are from docs or third parties and have not been run by us yet.

## Phase 0 (4 Oct 2026)

### Models

- **D1. Main model is hosted Gemma 4 26B** (`gemma-4-26b-a4b-it`, Google AI Studio, Google's native API through Mastra's model router as `google/gemma-4-26b-a4b-it`, `thinkingLevel: "minimal"`) for development, evals and the demo.
  - Why hosted: the laptop's MX130 has about 2 GB of video memory, so a local Gemma runs mostly on CPU (measured: 50 to 544 s per call, see PROGRESS).
  - Why not 31B (measured 4 Oct 2026): `gemma-4-31b-it` returned HTTP 500 on 7 of 13 calls (3 of 3 with a system message on the OpenAI-compatible URL), and took 9 to 52 s on the 6 calls that did answer. Per-call numbers are in PROGRESS.
  - Why the native API and not the OpenAI-compatible URL: on the OpenAI-compatible URL thinking cannot be turned off for Gemma (`reasoning_effort` is rejected) and the thoughts leak into the answer as `<thought>` text; calls took 8 to 10 s. On the native API with minimal thinking, 26B answered a system prompt, a JSON schema and a tool call in 1.3 to 2.1 s each.
  - Why no extra package: Mastra's model router already supports `google/<model>` with an explicit `apiKey` and `providerOptions.google`, so `@ai-sdk/google` is not installed separately.
  - **Rate limits are unknown.** AI Studio does not publish free-tier limits for Gemma 4. The hosted demo therefore needs the per-IP rate limit and cached sample briefs from Phase 5. Documented fallback if Google starts failing: OpenRouter `google/gemma-4-26b-a4b-it:free` over the OpenAI-compatible endpoint (20 requests/min, 50 requests/day, 1000/day after buying $10 credit; untested by us).
- **D1a. Env variables for the hosted model:** the key stays `HOSTED_API_KEY` and the model `HOSTED_MODEL`. `HOSTED_BASE_URL` is left empty for Google and is only set for an OpenAI-compatible fallback such as OpenRouter.
- **D2. Local Gemma is `gemma4:e4b` on Ollama**, used for the Wi-Fi-off privacy clip and a small benchmark only. Drop to `gemma4:e2b` only if e4b cannot produce the clip. `LLM_PROVIDER` defaults to `hosted`; switching the env var to `ollama` still runs everything locally.
- **D3. Gemma 4, not Gemma 3.** Gemma 4 is the current family and its Ollama page lists tool calling; `gemma3:4b` has no tools support on Ollama.
- **D4. Ollama context length.** Ollama defaults to a 4k context on machines with under 24 GB of video memory, and its OpenAI-compatible endpoint cannot set it per request. Set `OLLAMA_CONTEXT_LENGTH` (we start at 8192).
- **D5. Structured output fallback on Ollama.** If JSON through `/v1` is flaky, call Ollama's native API with a JSON schema in the `format` field. Reason: schema-constrained output beats prompt tricks.

### Hosting

- **D6. Render: no private Ollama service** (cut-order item 3 applied up front). The Render web service calls the hosted Gemma endpoint; `render.yaml` and the Deploy to Render button stay. Reason: private services and disks are paid only, and an 8 GB instance price could not be confirmed.
- **D7. Keeping the free Render service awake.** A `/api/health` route pinged every 5 minutes (UptimeRobot or a cron job) stops the 15-minute idle spin-down, so a judge does not wait for a cold start. One always-on service fits in the 750 free instance hours per month.

### Scope

- **D8. Benchmark size:** 3 local runs and 5 hosted runs per prompt; further measuring happens in Phase 1 evals. Reason: 10 CPU runs per prompt could take an hour.
- **D9. Fixtures:** 2 public repos plus Viva itself (was 3 plus Viva).
- **D10. Prize categories** confirmed by Wasih from the challenge page: Gemma ($200), Render ($200), Mastra, Entire, ElevenLabs, Sentry Agent Tracing ($100 each).
- **D11. ElevenLabs credits:** claim promo credits first; real voice only for testing and the video. Free tier is 10k credits/month; speech-to-text is reported at about 330 credits/min (unverified), so about 30 minutes.

### Tooling

- **D12. Node >= 22.13** is required by `@mastra/core` 1.74 (the laptop had 22.11.0).
- **D13. Scaffolded in a temp folder and copied in.** Reason: `create-next-app` rejects a folder name with capital letters (`Personal-viva`) and a non-empty folder.
- **D14. Next.js bundling and LibSQL.** `serverExternalPackages` lists `@libsql/client` and `@mastra/*` in `next.config.ts`, and memory is tested through a real API route in dev and in a production build. Reason: LibSQL is a native module and often breaks Next.js bundling.

### Entire

- **D15. Checkpoint storage** is one git ref per checkpoint, `refs/entire/checkpoints/<shard>/<id>` (`.entire/settings.json` shows `"type": "git-refs"`), not a branch. Format details to be confirmed on our own checkpoints in task 0.5.
- **D15a. Git workflow (asked for by Wasih, 4 Oct):** one branch and one commit per phase, opened as a pull request that he squash-merges; no attribution trailers. The first three commits had gone straight to `main` with trailers, so `main` was rewritten once (same content and dates, trailers removed) and force-pushed, and the one pushed checkpoint ref, whose transcript contained an email address, was deleted from GitHub.
- **D16. Command name:** it is `entire checkpoint explain <id|sha>`; there is no top-level `entire explain` in CLI 0.11.3.
- **D17. Privacy rule.** The repo is public and checkpoint refs are pushed with it, so session transcripts are public. Entire redacts detected secrets on a best-effort basis only. Keys live only in `.env` and are never pasted into a session.

### Entire checkpoint format (task 0.5, verified on this repo's first checkpoint, CLI 0.11.3)

- **D18. Where things live.** Each checkpoint is a commit at `refs/entire/checkpoints/<last 2 chars of id>/<id>`. Its tree:
  - `metadata.json`: `checkpoint_id`, `branch`, `files_touched[]`, `sessions[]` (paths to the files below), `token_usage`
  - `0/metadata.json`: `session_id`, `agent`, `model`, `created_at`, `files_touched[]`, `initial_attribution`
  - `0/prompt.txt`: the prompt of the turn that led to the commit
  - `0/transcript.jsonl`: compact transcript, one JSON object per line with `type` (`user` / `assistant`), `ts`, `content[]`
  - `0/full.jsonl`: the raw agent transcript (1.3 MB for our first one)
- **D19. Link from code to checkpoint** is the commit trailer `Entire-Checkpoint: <id>` on the normal commit. Our commits did not get an `Entire-Attribution` trailer; attribution is only inside `0/metadata.json`.
- **D20. Provenance is file-level.** `initial_attribution` has counts only (`agent_lines`, `human_added`, `human_modified`, `total_committed`, `agent_percentage`), no line ranges. So the AI-authored map is: commit -> `files_touched` + agent percentage + prompt. Line-level provenance (cut-order item 7) is not available from the checkpoint and is dropped.
- **D21. `prompt.txt` is not always a human prompt.** `[WHY]` Our first checkpoint's `prompt.txt` held a background-task notification, because that was the latest turn before the commit. The provenance reader must skip prompts that start with `<task-notification>` or other system tags and fall back to the last real `user` line in `transcript.jsonl`.
- **D22. GitHub API access works on a public repo** (verified with `gh api`): `git/matching-refs/entire/checkpoints` lists the refs, `git/trees/<commit sha>?recursive=1` lists the files, `git/blobs/<sha>` returns base64 content, and the commit message from `commits/<sha>` carries the trailer. Hosted mode can use the same reader logic as local mode.
- **D23. PII redaction turned on.** The first pushed transcript contained an email address (from the session's own context) and local Windows paths. Secret redaction is on by default but PII redaction is not, so `.entire/settings.json` now sets `redaction.pii.enabled` and `email`. It only affects checkpoints written from now on.

### Mastra spike (task 0.4, measured 4 Oct 2026 with `scripts/spikes/mastra.ts`)

- **D24. Native tool calls stay in the agent.** `readFile` was called in 5 of 5 runs on hosted 26B (median 2.9 s) and 1 of 1 on local `gemma4:e4b` (85 s). No need to drive tools from deterministic code.
- **D25. Structured output uses the schema-in-prompt mode** (`structuredOutput: { schema, jsonPromptInjection: true }`), then zod. Reason: Google's native JSON-schema mode hung with no response in at least 4 of 15 calls (a hang lasted about 308 s before a retry succeeded, or hit our 30 s timeout), while schema-in-prompt passed 5 of 5 in the spike and 10 of 10 in the benchmark at 3 to 7 s. Small samples; Phase 1 evals will re-measure.
- **D26. Every hosted model call gets a timeout** (`abortSignal: AbortSignal.timeout(30_000)`) plus one retry. `[WHY]` Without it a silent hang lasts 5 minutes, which is Node's default fetch timeout.
- **D27. Local model wiring:** `model: { id: "ollama/gemma4:e4b", url: OLLAMA_BASE_URL }` works through Mastra's router (Ollama's OpenAI-compatible endpoint). All four checks passed 1 of 1, in 50 s, 85 s, 210 s and 544 s.
- **D28. Memory:** `@mastra/memory` + `LibSQLStore` with an absolute `file:` path works inside a Next.js route handler under `next dev` and under `next build` + `next start`; a value saved before a server restart was read back after it. Weak spots are stored by plain code as thread metadata (one thread per repo), not by the model. `@libsql/client` is already on Next.js's built-in external-packages list; our `serverExternalPackages` entry is a belt-and-braces duplicate.
- **D29. Dynamic paths in routes need `/*turbopackIgnore: true*/`** inside `path.resolve(...)`, otherwise the production build warns that it is tracing the whole project.

### Fixtures (task 0.8)

- **D30.** Fixtures are `fixtures/vidyut-mitra` (Python backend + Next.js dashboard) and `fixtures/portfolio-new` (Vite + React), both Wasih's own public repos. Each has `SOURCE.md` (URL, commit), `FILES.tsv` (every tracked file with size) and `files/` (text files up to 70 KB; images, PDFs, fonts and lockfiles left out). `fixtures/` is excluded from typecheck, lint and tests because it is data, not our code. Neither repo has Entire checkpoints, so the provenance fixture is Viva itself (Phase 3).

### Research notes for later phases (unverified until used)

- **Mastra:** custom OpenAI-compatible endpoint via `model: { id, url, apiKey }` (docs show LM Studio only); fallback `@ai-sdk/openai-compatible`. Structured output via `agent.generate(prompt, { structuredOutput: { schema, jsonPromptInjection, errorStrategy, fallbackValue } })`. Memory via `@mastra/memory` + `@mastra/libsql`. Official Sentry exporter `@mastra/sentry`.
- **Entire over GitHub API:** `GET /repos/{owner}/{repo}/git/matching-refs/entire/checkpoints`, then trees and blobs (transcripts can be several MB, so use blobs, not contents).
- **ElevenLabs:** SDK `@elevenlabs/elevenlabs-js`; TTS model `eleven_flash_v2_5`; speech-to-text `POST /v1/speech-to-text` with `scribe_v2`, `words[]` of `{text, start, end, type}`; filler words are kept unless `no_verbatim` is set. Voice IDs from `GET /v2/voices`.
- **Sentry:** `npx @sentry/wizard@latest -i nextjs`; `vercelAIIntegration` is on by default, set `recordInputs` and `recordOutputs` to false; manual spans `gen_ai.invoke_agent`, `gen_ai.chat`, `gen_ai.execute_tool`. Free plan: 5M spans, 10 dashboards.
- **Render:** Deploy button URL `https://render.com/deploy?repo=<repo url>`; needs `render.yaml` at the repo root.
