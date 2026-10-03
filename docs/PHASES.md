# PHASES: Viva build plan

How to use this file (Claude Code): work top to bottom. For each task run the loop in `CLAUDE.md`: **research, ideate, plan, build, verify, log**. Tick a box only after it is verified. Add sub-checkboxes as you discover work; never delete a task, strike it through with a reason.

All times IST. Deadline: **Mon 5 Oct, 12:29 PM**. Internal publish target: **Mon 10:00 AM**.

## Schedule

| Phase | Goal | When | Timebox |
|---|---|---|---|
| 0 | Setup, research, spikes, model benchmark | Sat | 3 h |
| 1 | Core engine (ingest, brief, interview logic, report) | Sat | 4 h |
| 2 | Mastra interviewer agent: tools + memory | Sat night | 3 h |
| 3 | Entire provenance: question AI-written code | Sun early | 2.5 h |
| 4 | Text UI | Sun morning | 2.5 h |
| 5 | Render: blueprint, private Gemma service, deploy button | Sun midday | 2 h |
| 6 | ElevenLabs: personas, STT, delivery coaching | Sun afternoon | 2.5 h |
| 7 | Sentry: tracing, quality metrics, model comparison | Sun afternoon | 1.5 h |
| 8 | Gemma extras (nice to have) | Sun, only if ahead | 1 h |
| 9 | Friend test and demo video | Sun evening | 2.5 h |
| 10 | DEV post | Sun night + Mon morning | 3 to 4 h |
| 11 | Submit | Mon by 10:00 AM | 30 min |

## Cut order (apply top first when behind; re-check at every phase boundary)

1. Phase 8 entirely (image questions, difficulty slider)
2. Second persona (keep Tough tech lead only, one voice)
3. Render private Ollama service (use the hosted Gemma endpoint behind Render web service; keep the blueprint + button)
4. Long-pause detection (keep filler words and pace)
5. Progress-vs-last-session chart in the report (keep the "last time you struggled with X" opening)
6. Sentry dashboard (keep traced spans + attributes + screenshots)
7. Line-level provenance (keep file-level AI-authored map)

**Never cut:** core interview with grounded follow-ups, Mastra agent with readFile + memory, Entire provenance questions, hosted demo, friend test, demo video, the post.

---

## Phase 0: Setup, research, spikes (Sat, 3 h)

- [ ] **0.1 Repo and tooling**
  - [ ] Create public GitHub repo `viva` (first commit inside the challenge window)
  - [ ] Scaffold Next.js (App Router, TS strict, Tailwind, ESLint) with pnpm; add Vitest, zod, `typecheck`
  - [ ] Create `.env.example`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/post/`; fill the Commands section of CLAUDE.md
  - [ ] Verify `pnpm dev`, `pnpm typecheck`, `pnpm test`
- [ ] **0.2 Session capture (before any real coding)**
  - [ ] Install the Entire CLI (docs.entire.io/quickstart), run its Claude Code setup in the repo (`entire enable`), choose "always" to link commits to sessions. Verify with `entire checkpoint list` after a commit
  - [ ] Install DevRelay (devrelay.com, MCP server + skills) for saving a session to DEV later
  - [ ] Confirm the privacy rule: public repo means public checkpoints; no secrets in sessions
  - [ ] Timebox 20 minutes; log blockers in DECISIONS.md
- [ ] **0.3 Research: Gemma**
  - [ ] Current Gemma family and Ollama tags; pick the ~4B model that fits 16 GB RAM (do not test 12B locally)
  - [ ] Hosted Gemma option (OpenAI-compatible, free tier or credits) that offers a larger Gemma (12B or 27B): candidates Google AI Studio / Gemini API, OpenRouter, others. Record limits
  - [ ] Does the chosen Gemma accept images? (decides Phase 8)
- [ ] **0.4 Spike: Mastra (45 min, decides architecture)**
  - [ ] Minimal Mastra agent calling Ollama Gemma through an OpenAI-compatible provider
  - [ ] One tool call works (`readFile` stub) with the ~4B model
  - [ ] Structured output with a zod schema works, or a repair path is needed
  - [ ] Memory with local storage persists across two runs
  - [ ] Log results; if tool calling is unreliable on ~4B, decide: tools called by deterministic code between agent steps, or hosted larger Gemma as the agent's default
- [ ] **0.5 Spike: Entire checkpoint format (30 min)**
  - [ ] After a few commits in this repo, inspect the checkpoint data (`git for-each-ref refs/entire/checkpoints/`, the stored files, `entire checkpoint explain`)
  - [ ] Document the format in DECISIONS.md: where the prompt, transcript, changed files, and any attribution data live
  - [ ] Check whether the GitHub API can read these refs on a public repo (`git/matching-refs`, trees, blobs)
- [ ] **0.6 Research: other partners (read only)**
  - [ ] Render: private services, persistent disk, instance RAM needed for ~4B Gemma on Ollama, Blueprint syntax, Deploy to Render button; claim credits at hacktoberfest.com/my/promos
  - [ ] ElevenLabs: TTS endpoint, voice IDs for two personas, speech-to-text with word timestamps; claim credits
  - [ ] Sentry: Next.js setup, AI SDK / Mastra integration for automatic LLM spans, custom span attributes, dashboards
- [ ] **0.7 Model benchmark (post material)**
  - [ ] `scripts/bench-models.ts`: same brief + question prompts, ~~10 runs each on local ~4B and hosted larger Gemma~~ 3 runs on local `gemma4:e4b` and 5 on hosted Gemma 4 31B (DECISIONS D8: CPU runs are slow; the rest moves to Phase 1 evals)
  - [ ] Record: structured output validity, median latency, question specificity (names a real file?). Tag `[POST]`
  - [ ] Set `OLLAMA_MODEL` and `HOSTED_MODEL`
- [ ] **0.8 Fixtures**
  - [ ] ~~3 public repos of different shapes (Node API, React app, Python app; include one of Wasih's if public)~~ 2 public repos of different shapes, one of Wasih's if public (DECISIONS D9)
  - [ ] Snapshot selected files into `fixtures/`
  - [ ] Plan the third fixture: this repo itself (it will have Entire checkpoints by Phase 3)

---

## Phase 1: Core engine (Sat, 4 h)

Pure, testable logic that the Mastra agent will call.

- [ ] **1.1 Model provider setup**: one module creating the model for `ollama` or `hosted`; zod structured-output helper with one repair retry and typed fallback; latency and token metadata returned
- [ ] **1.2 Ingestion**: GitHub reader, local folder reader (`LOCAL_MODE` only), file selection heuristic, ignore list, token budget; tests on fixtures
- [ ] **1.3 Project brief**: prompt + schema; validate every path against the file list, drop and count invented ones `[WHY]`; verify on all fixtures, save to `fixtures/briefs/`
- [ ] **1.4 Interview logic**: state machine (rounds, counts, end conditions), rubric-driven question prompt, evaluation prompt with follow-up rule (must reference the answer), skip handling, persona instructions; unit tests on state transitions
- [ ] **1.5 Report**: scores and averages computed in code; Gemma writes strengths, weak spots, revision list, likely next questions; Markdown export
- [ ] **1.6 CLI + evals**: `scripts/interview.ts` (terminal interview); `scripts/eval.ts` with scripted good, vague, and wrong answers; metrics: validity, real-file rate, follow-up grounding (manual 10-sample check, iterate prompts to 8 of 10). Log `[POST]`

---

## Phase 2: Mastra interviewer agent (Sat night, 3 h)

- [ ] **2.1 Agent**: `src/mastra/agents/interviewer.ts` using the Phase 1 prompts and persona instructions; one turn = evaluate + decide + ask
- [ ] **2.2 Tools**: `listFiles`, `readFile(path, range?)` (validated paths only, size capped), `getProvenance(path)` (stub until Phase 3)
  - [ ] Verify: in deep-dive rounds the agent opens a file it was not given up front and asks about its contents; log an example `[POST]`
- [ ] **2.3 Memory (local mode)**: `saveWeakSpots` at report time, `recallWeakSpots` at session start, keyed by repo; storage file at `MEMORY_DB_PATH`; "forget this project" function
  - [ ] Verify: run two sessions on one fixture; second opens with "Last time you struggled with X" and retests it, 3 of 3 tries
- [ ] **2.4 Progress vs last session** in the report data (score delta per topic)
- [ ] **2.5 Hosted mode**: memory disabled cleanly, with a label explaining it is a local-mode feature
- [ ] **2.6 Evals still pass** with the agent in the loop; note any change in latency `[POST]`
- [ ] "How it works" summary for Wasih in PROGRESS.md

---

## Phase 3: Entire provenance (Sun early, 2.5 h)

- [ ] **3.1 Reader (local)**: read checkpoints from a local repo via git (or Entire CLI output), map commits to changed files, extract the originating prompt per checkpoint
- [ ] **3.2 Reader (hosted)**: same via GitHub API for public repos; graceful skip if refs are not readable
- [ ] **3.3 AI-authored map**: `ProvenanceEntry[]`; use attribution or line data if available, otherwise file-level; summarize long prompts to one line with Gemma
- [ ] **3.4 Wire into the agent**: real `getProvenance` tool; brief gets `ai-authored` hooks; interviewer instructions require at least one AI-code question and allow quoting the original prompt
- [ ] **3.5 UI data**: "AI-written areas" list for the brief screen; report flags AI-code questions
- [ ] **3.6 Dogfood fixture**: snapshot this repo (with its checkpoints) as fixture 4; verify Viva asks Wasih about code his agent wrote; save a good example `[POST]`
- [ ] **3.7 No-checkpoint path**: quiet skip plus a short hint about Entire

---

## Phase 4: Text UI (Sun morning, 2.5 h)

- [ ] **4.1 API routes** `/api/ingest`, `/api/turn`, `/api/report`: thin, zod-validated, stateless
- [ ] **4.2 Start screen**: repo input (folder path in local mode), persona, length, target role, voice toggle, sample repo buttons, mode badge
- [ ] **4.3 Brief screen**: summary, stack, hooks, AI-written areas, "last time" weak spots, correction box
- [ ] **4.4 Interview screen**: chat, round label, progress, answer box, skip, end early, live tool activity text ("reading src/auth.ts...")
- [ ] **4.5 Report screen**: per-question cards (AI-code flag), weak spots, revision list, likely next questions, delivery section placeholder, progress vs last, Markdown export
- [ ] **4.6 Error states**: bad URL, rate limit, model down, retry
- [ ] **4.7 Verify** all fixtures in the browser; screenshots to `docs/post/`

---

## Phase 5: Render (Sun midday, 2 h)

- [ ] **5.1 `render.yaml` blueprint**: web service (Next.js) ~~+ private service (Ollama with persistent disk, pulls the Gemma model on start); web talks to Ollama over the private network~~ calling the hosted Gemma endpoint (DECISIONS D6: private services and disks are paid only)
- [ ] **5.2 Deploy**; measure cold start and per-turn latency `[POST]`; add `/api/health` and a 5-minute uptime ping so the free instance stays awake (DECISIONS D7)
- [ ] **5.3 Hosted hardening**: `LOCAL_MODE=false`, per-IP rate limit, cached briefs for sample repos
- [ ] **5.4 Deploy to Render button** in README; test it from a clean account or fork if possible
- [ ] **5.5 Verify** the live URL from a fresh browser: full interview end to end

---

## Phase 6: ElevenLabs voice and delivery coaching (Sun afternoon, 2.5 h)

- [ ] **6.1 TTS** `/api/tts`: persona voices (Friendly HR, Tough tech lead); autoplay in voice mode; cache per question
- [ ] **6.2 STT** `/api/stt`: push-to-talk recording, ElevenLabs speech-to-text with word timestamps; editable transcript before sending
- [ ] **6.3 Delivery metrics** in `src/lib/delivery/` (pure functions, unit tested): filler words and rate, long pauses (over 2 s), wpm, duration
- [ ] **6.4 Report**: "How you said it" section with simple targets; per-answer delivery chips
- [ ] **6.5 Fallbacks**: mic denied or no key means text mode; note in UI that voice mode sends audio to ElevenLabs
- [ ] **6.6 Verify** a full voice interview locally and on Render; save a clip

---

## Phase 7: Sentry tracing (Sun afternoon, 1.5 h)

- [ ] **7.1 Setup** Sentry for Next.js; enable the AI SDK / Mastra integration for automatic model spans if available, else manual spans in the provider module
- [ ] **7.2 Turn span** as parent: tool calls (`readFile`, `getProvenance`, memory) and model calls as children
- [ ] **7.3 Quality attributes**: `invented_paths_dropped`, `json_repair_used`, `question_names_real_file`, `ai_authored_question`, `followup_references_answer`, `persona`, `model`, `provider`
- [ ] **7.4 Privacy**: confirm no answer text or audio in spans or breadcrumbs
- [ ] **7.5 Comparison**: run evals on local ~4B and hosted larger Gemma with tracing on; dashboard or screenshots comparing latency, repair rate, real-file rate `[POST]`
- [ ] **7.6 Debugging story**: find one real issue via traces, fix it, before/after numbers `[POST]` `[WHY]`

---

## Phase 8: Gemma extras (nice to have, only if ahead at Sun 4 PM)

- [ ] **8.1** If the Gemma model accepts images: fetch the README's architecture diagram and ask one question about it
- [ ] **8.2** Difficulty slider

---

## Phase 9: Friend test and demo video (Sun evening, 2.5 h)

- [ ] **9.1** [FRIEND_NAME] runs a real interview on their own project (voice if possible). Wasih watches and notes where they struggled
- [ ] **9.2** Ask: what was useful, what felt fake, would they use it before a real interview. Write their exact words (with permission to quote). If they agree, a second session to show the memory feature
- [ ] **9.3** Fix the top 1 or 2 issues if small
- [ ] **9.4 Demo video** using Wasih's demo skill. Scenes:
  1. The problem in one line (the friend's freeze moment)
  2. Paste repo, brief with AI-written areas
  3. A question about AI-written code quoting the original prompt
  4. A follow-up that references the answer; the agent opening a new file
  5. Voice answer, then delivery feedback
  6. Report, then a second session opening with "last time you struggled with..."
  7. Wi-Fi off, still works locally
  8. Dogfood: Viva interviewing Wasih about Viva
- [ ] **9.5 Narration** generated with ElevenLabs (script written by Wasih)
- [ ] **9.6** Fill the friend details in PRD section 2

---

## Phase 10: DEV post (Sun night + Mon morning)

Writing is weighted most. Claude prepares material; Wasih writes.

- [ ] **10.1** Open the official Submission Template from the challenge page; re-read rules and FAQ
- [ ] **10.2** Collect `[POST]` and `[WHY]` lines from PROGRESS.md into `docs/post/notes.md`
- [ ] **10.3 "Why this code exists"**: pick 3 `[WHY]` pieces of code, run `entire explain` on each, save excerpts and links
- [ ] **10.4 Agent session**: save one representative session to DEV with DevRelay for the `agent_session` embed
- [ ] **10.5 Outline** `docs/post/outline.md`, following the template sections:
  - What I Built: the friend, the freeze, the AI-coding era angle
  - Demo: video at the top, live link
  - Code: repo embed, Deploy to Render button
  - How I Built It: diagram (repo, provenance, Mastra agent + tools + memory, Gemma, report); partner subsections for Gemma, Mastra, Entire, ElevenLabs, Sentry, Render, each with one specific detail and a real number
  - Why Does Open Innovation Matter?: privacy, free, Wi-Fi off, own your instance on Render, model comparison results, honest trade-offs
  - "Why this code exists" (Entire excerpts)
  - My Agent Session: DevRelay embed
  - Handing it over: the friend's words
  - Prize Categories: all six
- [ ] **10.6** Wasih writes the draft; Claude reviews only for clarity, accuracy against the code, and unverified claims
- [ ] **10.7** Every number matches PROGRESS.md; all links and media load

---

## Phase 11: Submit (Mon, by 10:00 AM IST)

- [ ] **11.1** Live URL works from a fresh browser; Deploy button works; repo public; README complete
- [ ] **11.2** Publish the post; confirm it appears under the challenge's entries
- [ ] **11.3** Freeze `main`; any later commit gets a README note per the rules
- [ ] **11.4** Retro in PROGRESS.md: what to reuse for the Week 1 challenge (stack, Mastra setup, tracing helpers, post structure)