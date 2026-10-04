# DECISIONS

Architecture choices and research surprises, newest at the bottom. One line of reason each. Items marked "unverified" are from docs or third parties and have not been run by us yet.

## Phase 0 (4 Oct 2026)

### Models

- **D1. Main model is hosted Gemma 4 26B** (`gemma-4-26b-a4b-it`, Google AI Studio, Google's native API through Mastra's model router as `google/gemma-4-26b-a4b-it`, `thinkingLevel: "minimal"`) for development, evals and the demo.
  - Why hosted: the laptop's MX130 has about 2 GB of video memory, so a local Gemma runs mostly on CPU (measured: 50 to 544 s per call, see PROGRESS).
  - Why not 31B (measured 4 Oct 2026): `gemma-4-31b-it` returned HTTP 500 on 7 of 13 calls (3 of 3 with a system message on the OpenAI-compatible URL), and took 9 to 52 s on the 6 calls that did answer. Per-call numbers are in PROGRESS.
  - Why the native API and not the OpenAI-compatible URL: on the OpenAI-compatible URL thinking cannot be turned off for Gemma (`reasoning_effort` is rejected) and the thoughts leak into the answer as `<thought>` text; calls took 8 to 10 s. On the native API with minimal thinking, 26B answered a system prompt, a JSON schema and a tool call in 1.3 to 2.1 s each.
  - Why no extra package: Mastra's model router already supports `google/<model>` with an explicit `apiKey` and `providerOptions.google`, so `@ai-sdk/google` is not installed separately.
  - **Rate limits** were unknown at this point (AI Studio does not publish free-tier limits for Gemma 4); Phase 1 measured one, see D31. The hosted demo therefore needs the per-IP rate limit and cached sample briefs from Phase 5. Documented fallback if Google starts failing: OpenRouter `google/gemma-4-26b-a4b-it:free` over the OpenAI-compatible endpoint (20 requests/min, 50 requests/day, 1000/day after buying $10 credit; untested by us).
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

## Phase 1 (4 Oct 2026)

- **D31. Google's free tier limit is 16,000 input tokens per minute** for `gemma-4-26b-a4b-it` (quota id `GenerateContentInputTokensPerModelPerMinute-FreeTier`, read from a 429 error during the first eval). This replaces "rate limits are unknown" in D1. The limit is per API key, so on the hosted demo it is shared by every visitor: roughly 4 interview turns per minute in total. It makes the per-IP rate limit, cached sample briefs and the OpenRouter fallback (Phase 5) necessary, not optional.
- **D32. Prompt budgets sized to that limit:** brief reads at most 24,000 characters of file content (about 6k tokens), 4,000 per file; prompts list at most 150 file paths. `[WHY]` The first budget (40,000 characters) made the brief call slow enough to time out, the retry then hit the quota, and the eval silently ran on the fallback brief.
- **D33. A rate-limit error is waited out, not treated as a failure.** `generateStructured` reads "Please retry in Ns" from the error, sleeps that long (at most 60 s) and tries again with the same prompt. The call is marked `rateLimited` so latency numbers can leave it out.
- **D34. Brief and report get a 90 s timeout** on hosted (they are the longest prompts and answers); interview turns keep 30 s.
- **D35. One model call evaluates the answer and writes the follow-up.** A second call is only needed when the interview moves on to a new main question. Reason: keeps a turn at one or two calls.
- **D36. Follow-up grounding is checked in code.** The evaluation must include `quote`, a short phrase copied from the candidate's answer that the follow-up builds on. Code checks that the phrase really appears in the answer (case and spacing ignored, at least 8 characters). This is the automatic `followup_references_answer` metric; the manual 10-sample read stays as the real quality bar.
- **D37. The flow is decided by code, the words by Gemma.** Round order, follow-up limits, skip handling, hook choice, question ids and all scores' arithmetic are plain functions in `src/lib/interview/state.ts` and `report.ts`. A skip or "I don't know" is scored 0 without a model call.
- **D38. A failed evaluation is not a score.** If the model fails twice, the evaluation is a placeholder marked `evaluated: false` and is left out of every average, so a model outage cannot lower a candidate's result.
- **D39. Hooks carry an explicit `file` field** (a small addition to the PRD schema, which had only `ref`). Reason: path validation needs one unambiguous field to check. "file" and "function" hooks with an invented path are dropped; "decision" and "risk" hooks keep their text and lose the path.
- **D40. The model fills in small "draft" schemas;** code adds ids, rounds, persona and flags. Reason: a short form is filled in more reliably than a long one. Optional text fields the model tends to leave null (`followUp.reason`) are declared nullable instead of forcing a repair round.

- **D41. Token pacing before every hosted call** (`src/lib/llm/pacing.ts`). The process keeps a one-minute record of the tokens it sent and waits when the next call would pass 13,000 (kept under the real 16,000 because the count is an estimate at 3 characters per token; measured 3.2). `[WHY]` When the quota was used up, Google did not always answer 429: one raw call hung with no response for 170 s. After pacing was added, a 111-call eval had 0 rate-limit errors and 0 timeouts; 24 calls waited for budget.
- **D42. Turn latency target.** PRD asks for under 8 s per turn hosted. Measured medians are 6.7 s for an evaluation (which also carries the follow-up) and 7.4 s for a new main question, so a turn that ends with a follow-up meets the target and a turn that moves to a new main question (two calls) takes about 14 s. Not fixed in Phase 1; options for later are shorter prompts or writing the next main question while the candidate is still answering.

## Phase 2 (4 Oct 2026)

- **D43. One registered agent, per-request repo.** The interviewer is a single Mastra `Agent` registered on the `Mastra` instance (`src/mastra/index.ts`). The repo under discussion, the persona and the target role travel in Mastra's `RequestContext`; the tools and the agent's instructions read them from there. Reason: one agent to trace and explain, instead of building a new agent with new tools for every request.
- **D44. The agent writes the code questions; plain calls do the rest.** In the decisions, deep-dive and failure/scale rounds the question is written by the agent, which opens files itself with `readFile` (nothing is pasted in up front). Overview, retest and wrap-up questions, evaluations and the report use the plain structured call. Reason: tools only where looking at code helps; every tool step is another request against the 16,000 tokens-per-minute quota.
- **D45. Tools validate before they act.** `readFile` and `listFiles` normalise the path and check it against the repo's real file list. An invented path gets `found: false` with a message telling the model to pick a real one; nothing is read. `readFile` returns at most 4,000 characters per call and accepts a line range.
- **D46. `getProvenance` exists now and answers from the provenance list in the request context,** which is empty until Phase 3 fills it from Entire checkpoints.
- **D47. Memory is written by code, through Mastra memory.** One Mastra thread per repo on a local LibSQL file; the weak spots are the thread's metadata. `recallWeakSpots`, `saveWeakSpots` and `forgetProject` are plain functions, not model-called tools (the PRD listed them as tools). Reason: what is remembered must be predictable, and a small model deciding when to save is one more thing that can go wrong.
- **D48. Hosted mode keeps nothing.** With `LOCAL_MODE` not `true`, the memory functions return empty or false without opening a database, and `memoryStatus()` gives the UI a sentence saying memory is a local-mode feature.
- **D49. A returning session gets up to two "retest" questions first,** added on top of the normal plan (so the session is one or two questions longer). The sentence "Last time you struggled with X. Let's start there." is written by code in front of the model's question, so it cannot be left out.
- **D50. Progress vs last session** is computed per retested topic: remembered score before, average of this session's retest question and its follow-ups after. A retested topic that scores below 3 is saved again at the front of the list, so it is retested next time; one that reaches 3 is dropped.
- **D51. Known simplification:** a weak spot's remembered score is the session's overall average, not a per-topic score, because the model names weak topics freely and they do not map one-to-one onto questions. The "after" score of a retest is topic-specific.

## Phase 3 (4 Oct 2026)

- **D52. Provenance is commit-level by default.** A file counts as AI-written when it was changed in a commit that carries an `Entire-Checkpoint` trailer. Entire's own per-file list is used only when its attribution says the agent wrote lines and it lists touched files. `[WHY]` On this repo Entire's data was not usable: three checkpoints listed 6, 2 and 0 touched files for commits that each changed far more, and credited 0 lines to the agent (24,621 lines to the human for the Phase 0 commit). The likely reason is that this agent commits in the middle of a long turn, before Entire's end-of-turn snapshot has recorded its edits. Each entry records which rule applied (`source: "attribution" | "commit"`).
- **D53. The prompt comes from the transcript, not from `prompt.txt`.** All three of our checkpoints had the same stale background-task notification in `prompt.txt`. The reader parses the `user` lines of `0/transcript.jsonl`, drops machine-made messages (anything starting with a tag, interruption markers, messages under 12 characters) and unwraps pasted blocks.
- **D54. Which prompt belongs to a checkpoint:** the first human prompt typed after the previous checkpoint of the same session; if there is none in that window, the most recent earlier one. With one commit per phase this is coarse: a whole phase maps to one prompt, and the prompt can be a steering message rather than a task description. It is quoted as it was typed.
- **D55. Long prompts are shortened by code** (one line, 160 characters), not summarised by Gemma as PHASES 3.3 suggested. Reason: saves a model call per checkpoint under the 16,000 tokens-per-minute quota, and a literal quote is more honest than a paraphrase.
- **D56. "Your Entire session shows an AI agent wrote X (the prompt was: ...)" is written by code** in front of the model's question, the same way as the retest sentence. The model is told not to mention the session itself. This guarantees the definition-of-done item "asks about AI-written code and says so".
- **D57. AI-authored hooks are added by code after the brief** (`addAiHooks`): up to three AI-written source files, those the brief already mentions first. The deep-dive round picks an `ai-authored` hook before any other kind, so every interview on a repo with checkpoints gets at least one such question.
- **D58. Only source files become AI-written areas.** Tests, fixtures, spike scripts, docs, lockfiles and tool config files (`*.config.*`) are left out, and a file must still exist in the repo.
- **D59. One reader logic, two transports.** `src/lib/provenance/parse.ts` is pure and shared. `local.ts` gets the raw data with git commands (`for-each-ref`, `show`, `log --all`, `diff-tree`); `github.ts` gets it over REST (`matching-refs`, trees, blobs, commits). The GitHub reader also looks at up to 5 branches, so commits in open pull requests count.
- **D60. GitHub API budget.** Reading provenance for this repo takes roughly 20 requests (counted from the code path, not measured). Without a token GitHub allows 60 per hour per IP, so the hosted demo should set `GITHUB_TOKEN`. Limits: 12 checkpoints, 12 linked commits, transcripts up to 8 MB.
- **D61. The dogfood fixture stores extracted data, not transcripts.** `fixtures/viva/checkpoints.json` holds checkpoint metadata, linked commits with their files, and the human prompts, as produced by the local reader. Regenerate with `pnpm tsx scripts/snapshot-viva.ts`.
- **D62. Commit from PowerShell, not Git Bash.** A commit made through Git Bash got no `Entire-Checkpoint` trailer; the hook exits quietly when it cannot find the `entire` binary, which is the probable cause. The commit was redone from PowerShell and got its trailer.

## Phase 4 (4 Oct 2026)

- **D63. The browser holds the interview; the server holds nothing.** The whole `InterviewState` is sent with every `/api/turn` request and comes back updated. Routes validate it with the zod schema first.
- **D64. Repo lookups are cached in memory for 30 minutes** (`src/lib/server/sources.ts`), keyed by repo id. Reason: each stateless turn needs the repo again so the agent can open files, and asking GitHub for the file list every turn would use up its rate limit. The cache holds file lists of public repos only, no user data.
- **D65. Sample repos use the briefs saved by the eval run** (`fixtures/briefs/*.json`). A visitor sees a sample brief in well under a second and it costs no model tokens, which matters under the shared 16,000 tokens-per-minute quota. A correction always goes to the model.
- **D66. Errors have two kinds.** A `UserError` is the user's to fix: HTTP 400 and the message is shown as written ("Repository not found, or it is private."). Anything else is HTTP 500 with a generic message; details go to the server log only.
- **D67. Server logs carry metadata only:** per model call the time, the wait for token budget and the token counts; per failure the first line of the error. No prompt or answer text.
- **D68. The agent gets two tool calls per question and one attempt.** `[WHY]` On large files Gemma re-read the same file up to four times, sometimes emitted a malformed tool call (`MALFORMED_FUNCTION_CALL`), and ended without a question. The retry then repeated the tool calls and used about 8,000 of the 16,000 tokens per minute, so the next turn waited 35 to 40 s. Now the tools refuse a third call, and if the agent's single attempt fails the question is written by a plain call with the file pasted in (plan B). Measured after the change: turns of 6 to 13 s on the same sample, and plan B produced a proper question when the agent failed.
- **D69. The token pacer records real usage.** After each call the estimate is replaced by the input-token count the provider reported. Reason: agent calls resend the prompt on every tool step, so the estimate was too low and the quota was exceeded without the pacer noticing.
- **D70. No streaming yet.** The UI shows the candidate's answer immediately and a waiting line; what the agent did ("reading src/mastra/index.ts") appears under the question once the turn returns, not live. Live tool status needs a streaming route; left for later if time allows.
- **D71. System fonts only.** The scaffold's Google font was removed so the app starts with Wi-Fi off (the offline demo scene) and builds without network access to a font service.
- **D72. `/api/health`** returns mode, provider and model, for the uptime ping that keeps the free Render instance awake (D7).

### Research notes for later phases (unverified until used)

- **Mastra:** custom OpenAI-compatible endpoint via `model: { id, url, apiKey }` (docs show LM Studio only); fallback `@ai-sdk/openai-compatible`. Structured output via `agent.generate(prompt, { structuredOutput: { schema, jsonPromptInjection, errorStrategy, fallbackValue } })`. Memory via `@mastra/memory` + `@mastra/libsql`. Official Sentry exporter `@mastra/sentry`.
- **Entire over GitHub API:** `GET /repos/{owner}/{repo}/git/matching-refs/entire/checkpoints`, then trees and blobs (transcripts can be several MB, so use blobs, not contents).
- **ElevenLabs:** SDK `@elevenlabs/elevenlabs-js`; TTS model `eleven_flash_v2_5`; speech-to-text `POST /v1/speech-to-text` with `scribe_v2`, `words[]` of `{text, start, end, type}`; filler words are kept unless `no_verbatim` is set. Voice IDs from `GET /v2/voices`.
- **Sentry:** `npx @sentry/wizard@latest -i nextjs`; `vercelAIIntegration` is on by default, set `recordInputs` and `recordOutputs` to false; manual spans `gen_ai.invoke_agent`, `gen_ai.chat`, `gen_ai.execute_tool`. Free plan: 5M spans, 10 dashboards.
- **Render:** Deploy button URL `https://render.com/deploy?repo=<repo url>`; needs `render.yaml` at the repo root.
