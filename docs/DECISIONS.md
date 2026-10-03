# DECISIONS

Architecture choices and research surprises, newest at the bottom. One line of reason each. Items marked "unverified" are from docs or third parties and have not been run by us yet.

## Phase 0 (4 Oct 2026)

### Models

- **D1. Main model is hosted Gemma 4 31B** (`gemma-4-31b-it`, Google AI Studio, OpenAI-compatible endpoint) for development, evals and the demo. Reason: the laptop's MX130 has about 2 GB of video memory, so a local Gemma runs mostly on CPU and one interview turn could take 1 to 3 minutes. Fallback: OpenRouter `google/gemma-4-31b-it:free` (20 requests/min, 50 requests/day, 1000/day after buying $10 credit).
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
- **D16. Command name:** it is `entire checkpoint explain <id|sha>`; there is no top-level `entire explain` in CLI 0.11.3.
- **D17. Privacy rule.** The repo is public and checkpoint refs are pushed with it, so session transcripts are public. Entire redacts detected secrets on a best-effort basis only. Keys live only in `.env` and are never pasted into a session.

### Research notes for later phases (unverified until used)

- **Mastra:** custom OpenAI-compatible endpoint via `model: { id, url, apiKey }` (docs show LM Studio only); fallback `@ai-sdk/openai-compatible`. Structured output via `agent.generate(prompt, { structuredOutput: { schema, jsonPromptInjection, errorStrategy, fallbackValue } })`. Memory via `@mastra/memory` + `@mastra/libsql`. Official Sentry exporter `@mastra/sentry`.
- **Entire over GitHub API:** `GET /repos/{owner}/{repo}/git/matching-refs/entire/checkpoints`, then trees and blobs (transcripts can be several MB, so use blobs, not contents).
- **ElevenLabs:** SDK `@elevenlabs/elevenlabs-js`; TTS model `eleven_flash_v2_5`; speech-to-text `POST /v1/speech-to-text` with `scribe_v2`, `words[]` of `{text, start, end, type}`; filler words are kept unless `no_verbatim` is set. Voice IDs from `GET /v2/voices`.
- **Sentry:** `npx @sentry/wizard@latest -i nextjs`; `vercelAIIntegration` is on by default, set `recordInputs` and `recordOutputs` to false; manual spans `gen_ai.invoke_agent`, `gen_ai.chat`, `gen_ai.execute_tool`. Free plan: 5M spans, 10 dashboards.
- **Render:** Deploy button URL `https://render.com/deploy?repo=<repo url>`; needs `render.yaml` at the repo root.
