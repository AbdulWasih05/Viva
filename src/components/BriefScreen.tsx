"use client";

/** Screen 2: what Viva understood about the project. The candidate can correct it before the interview. */
import { useState } from "react";
import type { IngestResult } from "@/lib/client/api";
import { Badge, Button, ErrorNote, Panel, Path, Section, inputClass } from "./ui";

const KIND_LABELS = { file: "File", function: "Function", decision: "Decision", risk: "Risk", "ai-authored": "AI-written" } as const;

export function BriefScreen(props: {
  ingest: IngestResult;
  busy: boolean;
  error: string | null;
  onCorrect: (correction: string) => void;
  onBegin: () => void;
  onBack: () => void;
  onForget: () => void;
}) {
  const { ingest } = props;
  const { brief } = ingest;
  const [correction, setCorrection] = useState("");

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <button onClick={props.onBack} className="text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900">
          Choose another project
        </button>
        <h1 className="font-display text-4xl tracking-tight text-zinc-900">{ingest.repoLabel}</h1>
        <p className="max-w-3xl text-lg text-zinc-700">{brief.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          {brief.stack.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      </header>

      {ingest.usedFallback ? <ErrorNote message="The model could not analyse this repo, so the brief below only lists its main files. The interview will still work." /> : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-10">
          <Section title="What you may be asked about" aside={`${brief.hooks.length} topics`}>
            <ul className="divide-y divide-zinc-100">
              {brief.hooks.map((hook) => (
                <li key={hook.id} className="flex items-start gap-3 py-2.5">
                  <span className="w-24 shrink-0 pt-0.5">
                    <Badge tone={hook.kind === "ai-authored" ? "ai" : hook.kind === "risk" ? "warn" : "neutral"}>{KIND_LABELS[hook.kind]}</Badge>
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="text-zinc-900">{hook.ref}</span>
                    {hook.file && !hook.ref.includes(hook.file) ? (
                      <span className="mt-0.5 block">
                        <Path>{hook.file}</Path>
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="AI-written code" aside={ingest.aiAreas.length > 0 ? `${ingest.aiAreas.length} files, from ${ingest.checkpointCount} Entire checkpoints` : undefined}>
            {ingest.aiAreas.length === 0 ? (
              <p className="text-sm text-zinc-600">{ingest.provenanceHint ?? "No AI-written source files were found."}</p>
            ) : (
              <>
                <p className="text-sm text-zinc-700">
                  Your Entire checkpoints show an AI agent session produced these files. Expect at least one question about them, quoting the prompt that started the
                  session.
                </p>
                <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
                  {ingest.aiAreas.map((area) => (
                    <li key={area.path} className="px-3 py-2 text-sm">
                      <Path>{area.path}</Path>
                      <span className="mt-1 block text-xs text-zinc-500">
                        commit {area.commit} · prompt: &ldquo;{area.promptSummary}&rdquo;
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        </div>

        {/* The whole column stays in view while the long lists on the left scroll. */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Panel className="space-y-3">
            <h2 className="font-medium text-zinc-900">Ready?</h2>
            <p className="text-sm text-zinc-600">Answer the way you would in a real interview. You can skip a question or end early at any time.</p>
            <Button disabled={props.busy} onClick={props.onBegin} className="w-full">
              {props.busy ? "Starting..." : "Start the interview"}
            </Button>
            {props.error ? <ErrorNote message={props.error} /> : null}
          </Panel>

          <Panel className="space-y-3">
            <h2 className="font-medium text-zinc-900">Last time</h2>
            {ingest.previousWeakSpots.length > 0 ? (
              <>
                <p className="text-sm text-zinc-600">You struggled with these. The interview opens by retesting the first {Math.min(2, ingest.previousWeakSpots.length)}.</p>
                <ul className="space-y-1.5 text-sm text-zinc-800">
                  {ingest.previousWeakSpots.map((spot) => (
                    <li key={spot.topic} className="flex items-baseline justify-between gap-3">
                      <span>{spot.topic}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{spot.lastScore}/4</span>
                    </li>
                  ))}
                </ul>
                <Button variant="quiet" onClick={props.onForget}>
                  Forget this project
                </Button>
              </>
            ) : (
              <p className="text-sm text-zinc-600">{ingest.memory.enabled ? "No earlier session for this project yet." : ingest.memory.label}</p>
            )}
          </Panel>

          <Panel className="space-y-3">
            <h2 className="font-medium text-zinc-900">Anything wrong?</h2>
            <p className="text-sm text-zinc-600">Add one correction and Viva rewrites the brief.</p>
            <input
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              placeholder="The frontend was my teammate's work"
              maxLength={300}
              className={inputClass}
            />
            <Button variant="secondary" disabled={props.busy || correction.trim() === ""} onClick={() => props.onCorrect(correction.trim())} className="w-full">
              Update brief
            </Button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
