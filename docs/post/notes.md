# Post notes

Every line tagged `[POST]` or `[WHY]` in `docs/PROGRESS.md`, grouped by phase. Collected by script; the wording is unchanged.
Each number here was measured on the date and in the way its line says. Check a number against `docs/PROGRESS.md` before quoting it.

## 4 Oct 2026: Phase 0.1 and 0.2 (scaffold, session capture)

**Numbers and facts**

- `[POST]` First local speed measurement, one run of `ollama run gemma4:e4b --verbose --think=false` with a 22-token prompt on this laptop (15.9 GB RAM, MX130), Ollama's default 4096 context: cold model load 2 min 9 s, prompt read at 3.15 tokens/s, answer generated at 2.93 tokens/s (51 tokens in 17.4 s). At that prompt speed a 2,000-token repo brief would take about 10 minutes just to read in, which confirms D1. (`ollama ps` reported "266 MB, 100% GPU", which does not look right for a 6.6 GB model; not investigated.)
- `[POST]` Provenance is file-level: Entire stores how many lines the agent wrote per commit (for example 100% of 2 lines), not which lines.
- `[POST]` Privacy lesson on day one: the first public transcript included an email address from the session context. Turned on Entire's PII redaction for all later checkpoints.
- `[POST]` The plan assumed Gemma 3; research found Gemma 4 is current and lists tool calling on Ollama, which Gemma 3 did not.
- `[POST]` Honest trade-off: a 16 GB laptop with an MX130 cannot run interview turns on local Gemma at a usable speed, so local mode is a privacy option, not the default. Measured numbers to follow in 0.3 and 0.7.

**Why this code exists (bugs and their fixes)**

- `[POST]` `[WHY]` The checkpoint's `prompt.txt` was a background-task notification, not something Wasih typed. The provenance reader has to skip system-generated prompts and find the last real user message.

## 4 Oct 2026: Phase 0.3 to 0.8 (hosted model, Mastra spike, benchmark, fixtures)

**Numbers and facts**

- `[POST]` **Why not Gemma 4 31B.** Raw `fetch` calls to Google AI Studio with `gemma-4-31b-it`, 13 calls in total: 7 returned HTTP 500 "Internal error encountered" (3 of 3 calls that sent a system message on the OpenAI-compatible URL, 1 JSON-schema call there, and 3 of 6 on the native API). The 6 that answered took 9.0, 18.1, 24.8, 27.2, 46.1 and 51.5 s. Thinking could not be switched off on the OpenAI-compatible URL (`reasoning_effort` returned HTTP 400 "not supported for this model") and the thoughts came back inside the answer as `<thought>` text.
- `[POST]` **Why Gemma 4 26B.** `gemma-4-26b-a4b-it` on the native API with `thinkingLevel: "minimal"`: system prompt + JSON schema in 2.1 s, tool call in 1.3 s, plain question in 1.3 s (1 call each).
- `[POST]` **Mastra spike, hosted 26B** (`scripts/spikes/mastra.ts hosted 5`, 5 runs per check): plain generate 5/5 (median 1.3 s), `readFile` tool call 5/5 (median 3.1 s), structured output with the schema in the prompt 5/5 (median 3.4 s).
- `[POST]` **Mastra spike, local `gemma4:e4b`** (`scripts/spikes/mastra.ts ollama 1`, 1 run per check, Ollama default 4096 context, thinking left on): plain generate passed in 50 s, tool call passed in 85 s, structured output passed in 210 s (native) and 544 s (schema in prompt). It works; it is roughly 30 to 160 times slower than hosted on the same checks.
- **Benchmark, local `gemma4:e4b`:** not recorded yet. `[POST]` The first attempt ran while the laptop went to sleep for about two and a half hours, so its timings (up to 186 minutes for one call) measured the nap, not the model, and were thrown away. Rerun started on the morning of 4 Oct.

**Why this code exists (bugs and their fixes)**

- `[POST]` `[WHY]` **The 5-minute hang.** With Google's native JSON-schema mode, at least 4 of 15 structured-output calls got no response at all: two measured at 308 s each (Node's default fetch timeout is 300 s) before the SDK's retry succeeded, at least one more in an earlier run that took over 4 minutes but did not print per-run times, and one cut off by our 30 s timeout. The slow calls still "passed" and the median still read 2 s. Only printing every run's time exposed it. Fix: schema-in-prompt mode plus a 30 s timeout on every hosted call (DECISIONS D25, D26).
- **Memory:** Mastra memory on LibSQL saved weak spots through a Next.js route and read them back after a server restart, under `next dev` and under `next build` + `next start` (DECISIONS D28). `[WHY]` The first production build failed on a type error in the spike script and warned about a dynamic path; both would have been missed by testing with a script only.

## 4 Oct 2026: Phase 1 (core engine)

**Numbers and facts**

- `[POST]` **Eval results** (`pnpm eval`, 4 Oct 2026, hosted `gemma-4-26b-a4b-it`, both fixtures, 3 scripted candidates each, 5 main questions, 111 model calls, saved in `fixtures/evals/summary.json`):
- `[POST]` **Manual follow-up check (Claude's read, not yet Wasih's):** 10 samples from `fixtures/evals/followup-samples.json` (6 from the good candidate, 3 vague, 1 wrong): all 10 follow-ups pick up something the candidate actually said. Example: answer "It basically just works, I used it because everyone uses it and it is the best option." got "You said you used your stack because it is 'the best option'; what specific technical requirements or constraints led you to that conclusion?"
- `[POST]` **Local benchmark, finally** (`pnpm bench ollama 3`, `gemma4:e4b`, same 3,481-character brief prompt as hosted): 0 of 3 runs finished inside the 15-minute limit, while hosted took a median of 6.8 s for the same prompt. Caveat: other work (typecheck, tests, the hosted eval) was using the CPU during these runs, so local alone would be somewhat faster. The question prompt was not measured locally.

**Why this code exists (bugs and their fixes)**

- `[POST]` `[WHY]` **The first eval ran on a fake brief and looked fine.** The brief prompt (40,000 characters) timed out, the retry hit the quota, and the helper returned the safe fallback brief, exactly as designed. The interviews still ran, so the summary looked healthy. Only the line `fallback=true` gave it away. Fix: smaller budget (24,000 characters), longer limit for the brief, and the eval prints the fallback flag per brief.
- `[POST]` `[WHY]` **16,000 input tokens per minute.** The 429 error body named the quota. On the hosted demo every visitor shares it. Token pacing (DECISIONS D41) turned 429s and hangs into short waits.
- `[POST]` `[WHY]` **A hang instead of an error.** With the quota exhausted, one raw request to Google got no reply for 170 s. Same symptom as the Phase 0 "5-minute hang", so that one was probably the quota too, not the JSON-schema mode. (Not proven; the schema-in-prompt choice stays because it has worked in every run since.)

## 4 Oct 2026: Phase 2 (Mastra interviewer agent, tools, memory)

**Numbers and facts**

- `[POST]` **Agent check** (`scripts/spikes/agent-check.ts 3`, hosted 26B): 3 of 3 runs returned a valid question after the agent called `listFiles` and then `readFile` on a file of its own choosing, in 9.2 to 10.4 s. Example: it opened `src/components/ProjectCard.tsx` and asked "Explain the logic behind the `initialsOf` function ... How does it handle different casing styles in a project title?"
- `[POST]` **Eval with the agent in the loop** (`pnpm eval`, 4 Oct 2026, hosted 26B, both fixtures, 119 model calls, `fixtures/evals/summary.json`), compared with the Phase 1 run without the agent:
- `[POST]` **Agent example on the Python fixture:** the agent read `backend/analysis/subsidy_navigator.py` and asked "walk me through the logic inside the pm_surya_ghar_subsidy function. How exactly does the tiered math work for a system size of 1 kW, 3 kW, and 4 kW?" Nobody gave it that function name; it found it in the file.
- `[POST]` **Memory check** (`scripts/memory-check.ts 3`, hosted 26B, temp database): 3 of 3 tries. Each try ran a first session with weak answers, saved 5 weak spots, then started a second session from what memory returned. All three second sessions opened with, for example, `Last time you struggled with "System Architecture Knowledge". Let's start there. Explain why you chose to use a build-time script in scripts/render-resume.mjs ...`

## 4 Oct 2026: Phase 3 (Entire provenance)

**Numbers and facts**

- `[POST]` **Local reader on this repo** (`scripts/snapshot-viva.ts`, 4 Oct 2026): 3 checkpoints, 3 linked commits, 1 session with 5 human prompts, 26 AI-written source files.
- `[POST]` **GitHub reader on the public repo:** found the same 3 checkpoints and their commits on the open PR branches in about 10 s. Only 1 AI-written file was reported, because the default branch held just the scaffold at the time and a file must exist there to count. The repo without checkpoints returned no entries and the hint text.
- `[POST]` **Dogfood eval** (`pnpm eval viva`, hosted 26B, 60 model calls, `fixtures/evals/summary-viva.json`): 3 of 3 interviews asked at least one question about AI-written code. Output valid 60 of 60 (2 repaired), agent opened a file before 9 of 9 code questions, follow-up quote found 25 of 26, 1 call was rate limited and recovered by waiting.
- `[POST]` **What Viva asked Wasih about Viva:** `Your Entire session shows an AI agent wrote src/lib/interview/prompts.ts (the prompt was: "1,2 isdone lets skip teh devrealy install, render and eleven labs credits i will claim, yep lets do stacked prs"). In src/lib/interview/prompts.ts, how does the briefPrompt function ensure that the LLM generates accurate information ...` The quoted prompt is exactly what was typed, typos included.

**Why this code exists (bugs and their fixes)**

- `[POST]` `[WHY]` **Entire's own attribution said a human wrote this repo.** For the Phase 0 commit it recorded 0 agent lines and 24,621 human lines, and listed 6 touched files. So the reader falls back to "files changed in a commit linked to an agent session" (DECISIONS D52).
- `[POST]` `[WHY]` **`prompt.txt` was the same machine message in every checkpoint,** a background-task notification. Real prompts had to be dug out of the transcript and filtered (D53).
- `[POST]` `[WHY]` **One Phase 2 commit was invisible to Entire** because it was made from Git Bash; redone from PowerShell it was linked (D62).

## 4 Oct 2026: Phase 4 (text UI and API routes)

**Numbers and facts**

- `[POST]` **Turn times in the running app** (Viva sample, production build, 4 Oct 2026, from the server log): plain calls 4.4 to 6.3 s; an agent question that read one file 6.3 to 9.1 s; a whole turn (evaluation plus next question) 10.7 to 13.5 s. The PRD target of 8 s per turn is met only by turns that end in a follow-up.

**Why this code exists (bugs and their fixes)**

- `[POST]` `[WHY]` **The two-minute turns.** The first server test had turns of 120 and 128 s that ended in the generic fallback question. The server log (added for this) showed Gemma re-reading one file four times and once emitting `MALFORMED_FUNCTION_CALL`, then the retry eating half the per-minute token quota. Fix in DECISIONS D68 and D69.
- `[POST]` `[WHY]` **Stale screenshots, not a broken app.** During the browser walk the sample buttons seemed dead: three screenshots in a row showed the start screen. The page had in fact moved on; the browser window was hidden and not repainting. `document.visibilityState` said "hidden". Lesson: check the page text before debugging the code.

## 4 Oct 2026: Phase 5, code parts only (Render blueprint, rate limit, README)

**Numbers and facts**

- `[POST]` The hosted demo has no database and no private model service: one free web service, one Google AI Studio key. The whole "server" state is a 30-minute cache of public file lists and ten minutes of request counts per IP.

## 5 Oct 2026: voice cut, Phase 7 (minimal Sentry)

**Numbers and facts**

- `[POST]` Example turn span from the local log: `gen_ai.invoke_agent "interview turn" viva.round="deep-dive" viva.question_names_real_file=true viva.tool_calls=1 viva.json_repair_used=false viva.fallback_used=false viva.score=0`.
- `[POST]` Example model-call span: `gen_ai.chat "chat gemma-4-26b-a4b-it" viva.call="question (agent)" viva.waited_for_budget_ms=33867 gen_ai.usage.input_tokens=4929`. The 34-second wait for the free tier's token budget is visible as an attribute.

**Why this code exists (bugs and their fixes)**

- `[WHY]` First attempt logged nothing: Sentry SDK 11 streams spans and silently skips `beforeSendTransaction`; and `withSentryConfig` has to be imported from `@sentry/nextjs/config`.
