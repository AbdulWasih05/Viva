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

## 4 Oct 2026: Phase 1 (core engine)

What was built: provider setup and the structured-output helper (`src/lib/llm`), GitHub / local / fixture readers and file selection (`src/lib/ingest`), brief, state machine, turn logic and report (`src/lib/interview`), a terminal interview (`pnpm interview`) and the eval script (`pnpm eval`).

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (37 unit tests, no model needed) pass. The GitHub reader was run against `AbdulWasih05/Portfolio-new` (70 files listed, README read, an invented path refused) and the local reader against two folders (refused when `LOCAL_MODE` is off, never lists `.env` or `node_modules`). One terminal interview was run end to end with piped answers and wrote `viva-report.md`.

- `[POST]` **Eval results** (`pnpm eval`, 4 Oct 2026, hosted `gemma-4-26b-a4b-it`, both fixtures, 3 scripted candidates each, 5 main questions, 111 model calls, saved in `fixtures/evals/summary.json`):
  - Structured output valid after at most one repair: 109 of 111 (98%); 8 of 111 (7%) needed the repair attempt. Target was 95%.
  - Deep-dive questions naming a real file: 6 of 6.
  - Invented file paths: 0 in the two briefs, 0 in questions (so nothing had to be dropped in this run).
  - Follow-ups whose quoted phrase was found in the candidate's answer (automatic check): 42 of 43 (98%).
  - Average score per scripted candidate: good 3.44, vague 0.00, wrong 0.00 (out of 4). The good candidate is Gemma playing the student with the relevant file in front of it; vague and wrong are canned sentences.
  - Median model time, excluding waits for token budget: brief 29.4 s, question 7.4 s, evaluation 6.7 s, report 15.0 s. 24 of 111 calls waited for budget; 0 hit a rate-limit error.
  - 171,665 input tokens for the whole run.
- `[POST]` **Manual follow-up check (Claude's read, not yet Wasih's):** 10 samples from `fixtures/evals/followup-samples.json` (6 from the good candidate, 3 vague, 1 wrong): all 10 follow-ups pick up something the candidate actually said. Example: answer "It basically just works, I used it because everyone uses it and it is the best option." got "You said you used your stack because it is 'the best option'; what specific technical requirements or constraints led you to that conclusion?"
- `[POST]` `[WHY]` **The first eval ran on a fake brief and looked fine.** The brief prompt (40,000 characters) timed out, the retry hit the quota, and the helper returned the safe fallback brief, exactly as designed. The interviews still ran, so the summary looked healthy. Only the line `fallback=true` gave it away. Fix: smaller budget (24,000 characters), longer limit for the brief, and the eval prints the fallback flag per brief.
- `[POST]` `[WHY]` **16,000 input tokens per minute.** The 429 error body named the quota. On the hosted demo every visitor shares it. Token pacing (DECISIONS D41) turned 429s and hangs into short waits.
- `[POST]` `[WHY]` **A hang instead of an error.** With the quota exhausted, one raw request to Google got no reply for 170 s. Same symptom as the Phase 0 "5-minute hang", so that one was probably the quota too, not the JSON-schema mode. (Not proven; the schema-in-prompt choice stays because it has worked in every run since.)
- `[POST]` **Local benchmark, finally** (`pnpm bench ollama 3`, `gemma4:e4b`, same 3,481-character brief prompt as hosted): 0 of 3 runs finished inside the 15-minute limit, while hosted took a median of 6.8 s for the same prompt. Caveat: other work (typecheck, tests, the hosted eval) was using the CPU during these runs, so local alone would be somewhat faster. The question prompt was not measured locally.
- **Follow-up limit works as designed but is expensive for weak answers:** vague and wrong candidates got 2 follow-ups on every main question (15 questions for 5 mains).
- **Known gap:** a turn that moves on to a new main question makes two model calls and takes about 14 s, over the PRD's 8 s target (DECISIONS D42).
- **How it works (Phase 1, plain language):**
  - **Ingest:** list every file in the repo, drop junk (lockfiles, images, build output), score the rest (README first, then manifests, configs, entry points, bigger source files) and take the best ones until a size budget is full.
  - **Brief:** Gemma reads those files and fills in a form (summary, stack, components, decisions, risks, hooks). Code then checks every file path in the form against the real file list and removes any it made up.
  - **Interview:** code decides the plan (overview, decisions, deep dive, failure and scale, wrap-up) and which hook each question uses. Gemma writes the question and a rubric for it.
  - **Turn:** Gemma scores the answer 0 to 4 against the rubric and may propose a follow-up, quoting the phrase it is following up on. Code checks the quote is really in the answer, enforces the limit of two follow-ups, and scores a skip as 0 without asking the model.
  - **Report:** code computes the averages and the readiness label; Gemma writes the coaching text from the evaluated transcript.
  - **Safety net:** every model reply is checked with zod; one retry; then a safe fallback. Calls are paced to stay inside the free tier's tokens-per-minute limit.

## 4 Oct 2026: Phase 2 (Mastra interviewer agent, tools, memory)

What was built: the interviewer as a registered Mastra agent with three tools (`src/mastra/agents`, `src/mastra/tools/repo.ts`), per-request repo context, the agent plugged into the turn logic for the code rounds, cross-session memory on Mastra memory + LibSQL (`src/mastra/memory.ts`), retest questions for returning sessions, and progress vs last session in the report.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (49 unit tests, including the tools, the retest flow and real LibSQL save/recall/forget on a temp database) and `pnpm build` pass.

- `[POST]` **Agent check** (`scripts/spikes/agent-check.ts 3`, hosted 26B): 3 of 3 runs returned a valid question after the agent called `listFiles` and then `readFile` on a file of its own choosing, in 9.2 to 10.4 s. Example: it opened `src/components/ProjectCard.tsx` and asked "Explain the logic behind the `initialsOf` function ... How does it handle different casing styles in a project title?"
- `[POST]` **Eval with the agent in the loop** (`pnpm eval`, 4 Oct 2026, hosted 26B, both fixtures, 119 model calls, `fixtures/evals/summary.json`), compared with the Phase 1 run without the agent:
  - Structured output valid: 119 of 119 (Phase 1: 109 of 111). Needed repair: 1 of 119 (Phase 1: 8 of 111). Most of the drop in repairs comes from making `followUp.reason` nullable, not from the agent.
  - The agent opened at least one file before 18 of 18 code questions (decisions, deep-dive, failure/scale). It never tried an invented path in this run.
  - Deep-dive questions naming a real file: 6 of 6. Invented paths: 0.
  - Follow-up quote found in the answer: 51 of 51.
  - Average score: good 2.95, vague 0.00, wrong 0.00.
  - Median model time: question 8.6 s (Phase 1: 7.4 s), evaluation 5.4 s (6.7 s), brief 31.9 s, report 14.8 s.
  - Input tokens: 238,161 (Phase 1: 171,665), about 39% more for the run; the extra tool steps are the main difference, though the run also had 8 more calls. 47 of 119 calls waited for token budget; 0 rate-limit errors.
- `[POST]` **Agent example on the Python fixture:** the agent read `backend/analysis/subsidy_navigator.py` and asked "walk me through the logic inside the pm_surya_ghar_subsidy function. How exactly does the tiered math work for a system size of 1 kW, 3 kW, and 4 kW?" Nobody gave it that function name; it found it in the file.
- `[POST]` **Memory check** (`scripts/memory-check.ts 3`, hosted 26B, temp database): 3 of 3 tries. Each try ran a first session with weak answers, saved 5 weak spots, then started a second session from what memory returned. All three second sessions opened with, for example, `Last time you struggled with "System Architecture Knowledge". Let's start there. Explain why you chose to use a build-time script in scripts/render-resume.mjs ...`
- **Honest notes:** in the eval the agent made exactly one tool call per code question (never two), and `getProvenance` was never called because there is no provenance data until Phase 3. The "good" candidate scored lower than in Phase 1 (2.95 vs 3.44); the questions are different each run and the sample is two interviews, so this is not evidence of anything yet.
- **How it works (Phase 2, plain language):**
  - There is one interviewer agent. Each request tells it which repo, persona and role it is dealing with through Mastra's request context.
  - For questions about code, the agent is not shown the file. It has a `readFile` tool and decides what to open; the tool checks the path against the real file list before reading.
  - Scoring answers and writing the report do not need tools, so they stay as plain calls. That keeps turns fast and saves tokens.
  - After the report, plain code saves the weak spots under the repo's name in a small database file on the laptop. Hosted mode skips this entirely.
  - Next session, the saved weak spots come back, the first one or two questions retest them, and code writes the "Last time you struggled with ..." sentence so it is always there.
  - The report compares the remembered score with the new one for each retested topic. Topics that are still weak are saved again.

## 4 Oct 2026: Phase 3 (Entire provenance)

What was built: `src/lib/provenance` (pure parser, local git reader, GitHub reader), AI-authored hooks added to the brief, the "your Entire session shows ..." opening on questions about AI-written code, real data behind the `getProvenance` tool, the "AI-written areas" list for the UI, and the dogfood fixture `fixtures/viva` (this repo with its checkpoint data).

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (63 unit tests) and `pnpm build` pass. The local reader was run on this repo; the GitHub reader was run against `AbdulWasih05/Viva` and against a repo without checkpoints.

- `[POST]` **Local reader on this repo** (`scripts/snapshot-viva.ts`, 4 Oct 2026): 3 checkpoints, 3 linked commits, 1 session with 5 human prompts, 26 AI-written source files.
- `[POST]` **GitHub reader on the public repo:** found the same 3 checkpoints and their commits on the open PR branches in about 10 s. Only 1 AI-written file was reported, because the default branch held just the scaffold at the time and a file must exist there to count. The repo without checkpoints returned no entries and the hint text.
- `[POST]` **Dogfood eval** (`pnpm eval viva`, hosted 26B, 60 model calls, `fixtures/evals/summary-viva.json`): 3 of 3 interviews asked at least one question about AI-written code. Output valid 60 of 60 (2 repaired), agent opened a file before 9 of 9 code questions, follow-up quote found 25 of 26, 1 call was rate limited and recovered by waiting.
- `[POST]` **What Viva asked Wasih about Viva:** `Your Entire session shows an AI agent wrote src/lib/interview/prompts.ts (the prompt was: "1,2 isdone lets skip teh devrealy install, render and eleven labs credits i will claim, yep lets do stacked prs"). In src/lib/interview/prompts.ts, how does the briefPrompt function ensure that the LLM generates accurate information ...` The quoted prompt is exactly what was typed, typos included.
- `[POST]` `[WHY]` **Entire's own attribution said a human wrote this repo.** For the Phase 0 commit it recorded 0 agent lines and 24,621 human lines, and listed 6 touched files. So the reader falls back to "files changed in a commit linked to an agent session" (DECISIONS D52).
- `[POST]` `[WHY]` **`prompt.txt` was the same machine message in every checkpoint,** a background-task notification. Real prompts had to be dug out of the transcript and filtered (D53).
- `[POST]` `[WHY]` **One Phase 2 commit was invisible to Entire** because it was made from Git Bash; redone from PowerShell it was linked (D62).
- **Honest notes:** with one commit per phase, a whole phase maps to one prompt, and for Phases 1 and 2 that prompt is a steering message, not a task description. "AI-written" here means "changed in an agent-session commit", which is weaker than line-level proof. The GitHub reader has only been run on this one repo.
- **How it works (Phase 3, plain language):**
  - Entire saves each agent session as a git ref and stamps the code commit with `Entire-Checkpoint: <id>`.
  - Viva lists those refs, reads each checkpoint's metadata, and finds the commits that carry the stamp.
  - The files changed in a stamped commit are treated as AI-written. Tests, docs and config files are left out.
  - The prompt is taken from the session transcript: the first thing the person typed after the previous checkpoint.
  - Up to three of those files become "ai-authored" hooks, and the deep-dive round uses one of them first.
  - Code writes the sentence saying the session shows an agent wrote the file and quotes the prompt; Gemma then asks how the code works. A repo without checkpoints skips all of this and shows a one-line hint.

## 4 Oct 2026: Phase 4 (text UI and API routes)

What was built: API routes `/api/ingest`, `/api/turn`, `/api/report`, `/api/memory` and `/api/health` (thin, zod-validated, stateless); four screens in `src/components` (start, brief, interview, report) driven by one client component; error states with retry; Markdown download and copy.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (63 tests) and `pnpm build` pass. Against the production build (`pnpm start`, hosted mode):

- **API walk by script:** health; three error cases (bad URL, invalid state, missing repo) each returned HTTP 400 with a readable message; ingest of the Viva sample in 28 ms (saved brief, 11 hooks, 26 AI-written files, 3 checkpoints); turns; end early; report.
- **Browser walk** on the Viva sample: start screen, brief with the AI-written areas panel, first question, an answer scored 2/4 with the follow-up "You mentioned a state machine runs the scoring; how exactly is that state machine implemented in the codebase?", a skip shown as skipped, a decisions question with the line "Before asking, Viva was reading src/mastra/index.ts", end early, and the full report with strengths, weak spots, revision list and five likely next questions.
- **Not verified:** the Vidyut Mitra and Portfolio samples were only exercised through the API, not clicked through in the browser. Screenshots exist for the start and brief screens only (`docs/post/ui-*.jpg`); the browser window was hidden during the walk, so later screens were checked by reading the page text instead of by picture. Markdown download and copy were not clicked. Local mode (folder input, memory, forget button) was not walked in the browser.

- `[POST]` **Turn times in the running app** (Viva sample, production build, 4 Oct 2026, from the server log): plain calls 4.4 to 6.3 s; an agent question that read one file 6.3 to 9.1 s; a whole turn (evaluation plus next question) 10.7 to 13.5 s. The PRD target of 8 s per turn is met only by turns that end in a follow-up.
- `[POST]` `[WHY]` **The two-minute turns.** The first server test had turns of 120 and 128 s that ended in the generic fallback question. The server log (added for this) showed Gemma re-reading one file four times and once emitting `MALFORMED_FUNCTION_CALL`, then the retry eating half the per-minute token quota. Fix in DECISIONS D68 and D69.
- `[POST]` `[WHY]` **Stale screenshots, not a broken app.** During the browser walk the sample buttons seemed dead: three screenshots in a row showed the start screen. The page had in fact moved on; the browser window was hidden and not repainting. `document.visibilityState` said "hidden". Lesson: check the page text before debugging the code.
- **Known gaps:** tool activity is shown after the turn, not live (no streaming). A script that answers instantly makes the token pacer wait 30 to 40 s; a person typing answers should rarely hit it, but two simultaneous visitors on the hosted demo will.
- **How it works (Phase 4, plain language):**
  - The page is one React component with four steps. It keeps the whole interview in the browser.
  - "Read my project" calls `/api/ingest`, which loads the repo, reads Entire provenance, and returns the brief.
  - Each answer goes to `/api/turn` together with the whole interview so far. The server scores it, asks the agent or the model for the next question, and sends the updated interview back.
  - `/api/report` computes the scores, has Gemma write the coaching text, and in local mode saves the weak spots.
  - Every route checks its input with zod and turns any failure into a clear JSON error, so the page can show a message and a "Try again" link.

## 4 Oct 2026: Phase 5, code parts only (Render blueprint, rate limit, README)

What was built: `render.yaml`, the per-IP rate limit on `/api/ingest`, `/api/turn` and `/api/report`, and the README.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (69 tests) and `pnpm build` pass. The blueprint's build command (`pnpm install --frozen-lockfile`, then `pnpm build`) was run locally. Against the production server in hosted mode, ten ingest requests from one IP returned 200 eight times and then 429 with `Retry-After: 600`; a request from a second IP returned 200.

- **Not done, needs Wasih:** the deploy itself (5.2), testing the Deploy button from a clean account (5.4) and walking the live URL (5.5). `render.yaml` has never been run by Render, so the plan name, Node version setting and pnpm build are unverified there.
- `[POST]` The hosted demo has no database and no private model service: one free web service, one Google AI Studio key. The whole "server" state is a 30-minute cache of public file lists and ten minutes of request counts per IP.
- **How it works (Phase 5, plain language):**
  - `render.yaml` tells Render how to build and start the app and which settings to ask for.
  - Each API route first counts recent requests from the caller's IP address; over the limit, it answers "try again in N minutes" without touching the model.
  - Sample repos use briefs saved in the repo, so opening one costs no model tokens.

## 5 Oct 2026: voice cut, Phase 7 (minimal Sentry)

What changed: voice was cut from the app (DECISIONS D78), so the mic button, the voice badge and the "How you said it" card were removed. Sentry tracing was added: server setup, a helper in `src/lib/tracing`, a span per interview turn with quality attributes, a span per model call and per file read.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm test` (69 tests) and `pnpm build` pass. With a placeholder DSN and `SENTRY_DEBUG_SPANS=true`, four turns on the Portfolio sample printed 4 turn spans, 7 model-call spans and 3 tool spans to the server log, with the attributes listed in D83 and no prompt or answer text.

- **Not done, needs a real `SENTRY_DSN`:** nothing has been sent to a real Sentry project. The 3 traced interviews, the screenshots and the check of Sentry's automatic spans are open (PHASES 7.4, 7.4a).
- `[POST]` Example turn span from the local log: `gen_ai.invoke_agent "interview turn" viva.round="deep-dive" viva.question_names_real_file=true viva.tool_calls=1 viva.json_repair_used=false viva.fallback_used=false viva.score=0`.
- `[POST]` Example model-call span: `gen_ai.chat "chat gemma-4-26b-a4b-it" viva.call="question (agent)" viva.waited_for_budget_ms=33867 gen_ai.usage.input_tokens=4929`. The 34-second wait for the free tier's token budget is visible as an attribute.
- `[WHY]` First attempt logged nothing: Sentry SDK 11 streams spans and silently skips `beforeSendTransaction`; and `withSentryConfig` has to be imported from `@sentry/nextjs/config`.
- **How it works (Phase 7, plain language):**
  - When the server starts, Next.js runs `instrumentation.ts`, which loads the Sentry setup if a DSN is configured.
  - `/api/turn` wraps each turn in a span and, when the turn is done, writes the quality facts onto it as attributes.
  - `generateStructured` wraps each model call in a child span with time, tokens, and whether a repair or fallback was needed.
  - Only numbers, true/false values and short labels are attached. The candidate's answers never are.
