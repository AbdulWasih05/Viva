PRD: Viva, an AI interview coach for the AI-coding era

Status: v2 for the DEV Hacktoberfest 2026 Weekend Challenge (Build for a Friend)
Owner: Abdul Wasih
Deadline: Mon 5 Oct 2026, 12:29 PM IST

## 1. Problem

Final-year students put one or two projects on their resume. In placement interviews and project vivas, the panel opens with "walk me through your project", then quickly asks "why did you choose X?", "what happens if Y fails?", "how would this scale?".

Two things make this harder now:

1. Many students have never been questioned on their project. They freeze, give vague answers, or discover gaps live in the interview.
2. More and more of each project is written by AI coding agents. Interviewers know it and probe exactly those parts. A student who cannot explain code their agent wrote looks worse than one who wrote less.

Generic interview prep tools ask generic questions. Nothing questions you about *your* code, and nothing knows which parts your AI wrote.

## 2. The friend

Hasan Ekkeri is Wasih's batchmate. Their project is [Vidyut Mitra, a whatsapp first ai agent that solves your electricity bill crisis. Placements are coming up. In a recent mock or real interview they went pindrop silence. The project which started initally as hackathon project with myself and due to time constraints shipping was not a bottleneck but understanding the code was. Viva is built for them first.

Success for the friend: after two sessions they can answer "why" and "what if" questions about their own project with confidence, understand the parts their AI wrote, and know which 3 to 5 topics to revise.


## 3. Why open models (the challenge's core question)

- **Privacy:** in local mode, code (including private repos), answers, and memory never leave the laptop. The hosted demo stores nothing.
- **Free forever:** practice 50 times the night before an interview, no bill.
- **Offline:** local folder + Ollama + Gemma works with Wi-Fi off, for example in a college lab. Shown live in the demo.
- **Control and ownership:** prompts, rubric, personas, and model are all swappable. Any coding club can deploy its own private Viva on Render in one click, running Gemma on its own instance.
- **Honest trade-offs:** voice mode sends audio to ElevenLabs; say so in the post and keep text mode fully private.

Gemma is the brain: it reads the project, decides what to ask, judges answers, and writes the report. Mastra (open source) runs the agent loop.

## 4. Users and scenarios

1. **Student prepping for placements** (primary): pastes their repo, does a 15-minute interview (voice or text), reads the report, revises, comes back; Viva retests last time's weak spots.
2. **Student who leaned on an AI agent:** their repo has Entire checkpoints; Viva targets the AI-written parts.
3. **Student with a private repo:** runs Viva locally on a folder with local Gemma.
4. **Coding club lead:** clicks "Deploy to Render" to host a private Viva for the club.
5. **Judge / visitor:** opens the hosted link, clicks a sample repo, finishes a short interview in about 2 minutes.

## 5. Scope

### Must have

- **F1. Project ingestion**

  - Input: public GitHub URL; local mode also accepts a folder path.
  - Select the most informative files: README, manifests, architecture-revealing configs (docker-compose, schemas, env examples), entry points, central source files. Skip lockfiles, binaries, build output, vendored code.
  - Token budget sized to the local ~4B Gemma context (measured in Phase 0).
  - Gemma produces a **ProjectBrief**: summary, stack, components, visible design decisions, risks, and interview "hooks" (specific files, functions, choices).
  - **Every path in the brief is validated against the real file list; invented paths are dropped and counted** (this count is a Sentry metric).
  - The user reviews the brief and can add one correction ("the frontend was my teammate's").
- **F2. AI provenance from Entire (standout feature)**

  - If the repo contains Entire checkpoints, read them: which commits and files were agent-assisted, and the prompt that started each piece.
  - Build an **AI-authored map** (file, approximate scope, originating prompt summary). Use Entire's attribution data if available; otherwise use commit-level file lists.
  - Add hooks of kind `ai-authored`; the interviewer must ask at least one question about AI-written code and may quote the original prompt ("your session asked the agent to 'add JWT auth'. Walk me through how the refresh works").
  - Show an "AI-written areas" panel on the brief screen.
  - No checkpoints present: skip quietly, with a hint about Entire.
  - Local mode reads via git (or the Entire CLI); hosted mode via the GitHub API on public repos.
- **F3. Interviewer agent (Mastra)**

  - A Mastra agent with tools:
    - `listFiles`, `readFile(path, range?)`: open more code mid-interview for a sharper deep-dive question (validated paths only)
    - `getProvenance(path)`: was this AI-written, and from what prompt
    - `recallWeakSpots(repoId)` / `saveWeakSpots(repoId, items)`: cross-session memory
  - Rounds: Overview, Decisions, Deep dive (incl. AI-written code), Failure and scale, Wrap-up.
  - Default 8 main questions (5 to 12), max 2 follow-ups each.
  - Each turn: evaluate the last answer against the rubric, decide follow-up or move on, ask the next question.
  - **Follow-ups must reference the candidate's actual answer.** Main quality bar.
  - "Skip" and "I don't know" are scored and added to the revision list.
  - Personas: **Friendly HR round** and **Tough tech lead**; each has its own instructions and voice.
- **F4. Memory across sessions (Mastra memory, local mode)**

  - At the end of an interview, save weak spots and missed rubric points per repo.
  - Next session on the same repo opens with: "Last time you struggled with X. Let's start there." and retests them.
  - Report shows progress vs last session (score change per topic).
  - Stored on the laptop only; a "forget this project" button clears it. Hosted mode: memory off, labeled as a local-mode feature.
- **F5. Voice and delivery coaching (ElevenLabs)**: CUT on 4 Oct 2026 (DECISIONS D78). Not built; ElevenLabs only narrates the demo video. The original text is kept below for the record.

  - TTS for interviewer questions, a different voice per persona.
  - STT for spoken answers, with word-level timestamps; transcript editable before sending.
  - **Delivery metrics** computed in code from timestamps and transcript: filler-word count and rate ("umm", "uh", "basically", "like", "actually"), long pauses (over 2 s), speaking pace (words per minute), answer length.
  - Report section "How you said it" next to "What you said", with simple targets (for example, pace 120 to 160 wpm).
  - Text mode stays default fallback when mic or keys are missing.
- **F6. Report**

  - Per question: question, answer summary, score 0 to 4, good points, missing points, flagged if about AI-written code.
  - Overall: readiness, strengths, top 3 to 5 weak spots, revision list, 5 likely next questions, delivery summary, progress vs last session.
  - Export Markdown.
- **F7. Two modes, one codebase**

  - **Local:** Ollama + Gemma 4 E4B, folders, memory, offline capable. Slow on a CPU-only laptop, so it is the privacy option, not the default (DECISIONS D1, D2).
  - **Hosted (Render):** web service calling hosted Gemma 4 26B on Google AI Studio (DECISIONS D1, D6; the private Ollama service on Render was cut because it is paid only). GitHub URLs only, per-IP rate limit, sample repos with cached briefs.
  - **Deploy to Render** button with `render.yaml` blueprint in the README.
- **F8. Agent tracing (Sentry)**

  - Every agent step and model call traced: operation, model, provider, latency, tokens, tool calls.
  - Custom quality attributes: `invented_paths_dropped`, `json_repair_used`, `followup_references_answer` (judged cheaply in code or by a short check), `question_names_real_file`, `ai_authored_question`.
  - A Sentry dashboard of these metrics; comparison of local ~4B vs hosted larger Gemma.
  - No answer text or audio in traces (metadata only).
  - One real debugging story found via traces.
- **F9. Text interview UI**

  - Start: repo input, mode badge (Local, private / Hosted demo), persona, length, target role, voice toggle, sample repos.
  - Brief review: summary, stack, hooks, AI-written areas, "last time" weak spots, correction box.
  - Interview: chat layout, round label, progress, answer box, mic button, skip, end early, status text ("reading src/auth.ts...") when the agent uses tools.
  - Report screen.

### Nice to have (first to cut)

- If the chosen Gemma accepts images: ask about the architecture diagram in the candidate's README.
- Difficulty slider beyond the two personas.
- Mobile polish.

### Out of scope

Accounts, server-side databases, private repos in hosted mode, video, proctoring, resume parsing.

## 6. Functional details

### Schemas (zod, `src/lib/interview/schemas.ts`)

- `ProjectBrief`: summary, stack[], components[{name, purpose, files[]}], decisions[], risks[], hooks[{id, kind: "file"|"function"|"decision"|"risk"|"ai-authored", ref, why}]
- `ProvenanceEntry`: path, commit, checkpointId, promptSummary, scope ("file"|"lines"), lines?
- `Question`: id, round, persona, text, hookId?, filesRead[], rubric{mustMention[], goodSignals[], redFlags[]}, isFollowUp, parentId?, aboutAiCode
- `Evaluation`: questionId, answerSummary, score 0 to 4, good[], missing[], followUp{ask, reason}
- `DeliveryMetrics`: durationSec, words, wpm, fillerCount, fillerRate, longPauses[], fillersByWord{}
- `WeakSpot`: topic, evidence, lastScore, sessionDate
- `InterviewState`: brief, provenance[], userCorrection?, previousWeakSpots[], questions[], answers[], evaluations[], delivery[], round, counts, settings
- `Report`: overall, readiness, perQuestion[], strengths[], weakSpots[], revisionList[], likelyNextQuestions[], deliverySummary, progressVsLast[]

### API

- `POST /api/ingest` returns `{ brief, provenance, filesUsed, previousWeakSpots }`
- `POST /api/turn` `{ state, answer, delivery? }` returns `{ state, evaluation?, nextQuestion | done, toolActivity[] }`
- `POST /api/report` `{ state }` returns `{ report }` (and saves weak spots in local mode)
- `POST /api/tts` `{ text, persona }` returns audio
- `POST /api/stt` audio returns `{ transcript, words[{text,start,end}], delivery }`

State travels with the client; the server is stateless except local-mode memory.

### Scoring rubric (0 to 4)

0 no answer or wrong; 1 vague, not specific; 2 correct but shallow; 3 solid and specific; 4 excellent, with trade-offs or alternatives.

## 7. Non-functional requirements

- Latency: under 8 s per turn hosted; local measured and reported honestly.
- Robustness: bad model output never crashes the UI.
- Privacy: no server persistence in hosted mode; memory local only; no answer text or audio in traces or logs.
- Cost: hosted demo within free tiers and partner credits; rate limited.
- Explainability: readable by a final-year student; prompts in one place.

## 8. Success metrics (measured; real numbers go in the post)

- Structured output validity after repair: 95%+
- Follow-ups referencing the actual answer: 8 of 10 in a manual check
- Deep-dive questions naming a real file: 80%+
- Invented paths reaching the user: 0 (all caught by validation; report how many were caught)
- On a repo with checkpoints, at least 1 AI-authored question per interview: 100%
- Memory: second session opens with last session's weak spots: works on 3 of 3 tries
- Median turn latency: local ~4B vs hosted larger Gemma
- The friend's verdict, quoted

## 9. Risks and mitigations


| Risk                                                   | Mitigation                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~4B Gemma too weak for agent tool use                  | Keep tools few and simple; deterministic code does validation and scoring; compare with hosted larger Gemma and default hosted mode to it if needed |
| Mastra + small model structured output is flaky        | zod repair path; Phase 0 spike before committing                                                                                                    |
| Entire checkpoint format harder to parse than expected | Fall back to commit-level file lists from checkpoints; use Viva's own repo as the test fixture                                                      |
| Gemma on Render CPU too slow or too costly             | Fallback to hosted Gemma endpoint, say so in the post                                                                                               |
| ElevenLabs STT timestamps missing or inconsistent      | Compute pace and fillers from transcript only; pauses become optional                                                                               |
| Scope too big for the weekend                          | Cut order in PHASES.md; never cut core interview, Mastra, or Entire provenance                                                                      |
| Running out of time for the post                       | Post work starts Sunday night                                                                                                                       |

## 10. Submission checklist (DEV)

- [ ]  Post created from the official Submission Template (tags: devchallenge, weekendchallenge, hf26challenge)
- [ ]  Sections: What I Built, Demo, Code, How I Built It, Why Does Open Innovation Matter?, My Agent Session, Prize Categories
- [ ]  Story: the friend, the freeze moment, the AI-coding angle
- [ ]  Demo video (Wasih's demo skill) with ElevenLabs narration, Wi-Fi-off moment, memory moment, AI-written-code question, dogfood scene
- [ ]  Partner sections: Gemma, Render, Mastra, Entire, ElevenLabs, Sentry, each with something specific
- [ ]  "Why this code exists" section with 3 `entire explain` excerpts
- [ ]  Agent session embedded via DevRelay (`agent_session` tag) or linked
- [ ]  Prize Categories lists all six
- [ ]  Friend's reaction quoted
- [ ]  Repo public, README complete, Deploy to Render button works
- [ ]  Rules re-checked: eligibility (18+, country), team handles if any
