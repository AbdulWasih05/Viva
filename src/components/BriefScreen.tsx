"use client";

/** Screen 2: what Viva understood about the project. The candidate can correct it before the interview. */
import { useState } from "react";
import type { IngestResult } from "@/lib/client/api";
import { Badge, Button, Card, ErrorNote } from "./ui";

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
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{ingest.repoLabel}</h1>
        <button onClick={props.onBack} className="text-sm text-zinc-400 underline underline-offset-2 hover:text-white">
          Choose another project
        </button>
      </header>

      {ingest.usedFallback ? <ErrorNote message="The model could not analyse this repo, so the brief below only lists its main files. The interview will still work." /> : null}

      <Card title="What Viva understood">
        <p className="text-zinc-200">{brief.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {brief.stack.map((item) => (
            <Badge key={item}>{item}</Badge>
          ))}
        </div>
      </Card>

      <Card title="What you may be asked about">
        <ul className="space-y-2 text-sm">
          {brief.hooks.map((hook) => (
            <li key={hook.id} className="flex gap-3">
              <span className="shrink-0">
                <Badge tone={hook.kind === "ai-authored" ? "violet" : hook.kind === "risk" ? "amber" : "neutral"}>{hook.kind}</Badge>
              </span>
              <span>
                <span className="text-zinc-100">{hook.ref}</span>
                {hook.file ? <code className="ml-2 text-xs text-zinc-400">{hook.file}</code> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="AI-written areas">
        {ingest.aiAreas.length === 0 ? (
          <p className="text-sm text-zinc-400">{ingest.provenanceHint ?? "No AI-written source files were found."}</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-zinc-300">
              {ingest.checkpointCount} Entire checkpoint{ingest.checkpointCount === 1 ? "" : "s"} show an AI agent session produced {ingest.aiAreas.length} source file
              {ingest.aiAreas.length === 1 ? "" : "s"}. Expect at least one question on them.
            </p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {ingest.aiAreas.map((area) => (
                <li key={area.path}>
                  <code className="text-violet-300">{area.path}</code>
                  <span className="ml-2 text-zinc-500">
                    commit {area.commit}, prompt: &ldquo;{area.promptSummary}&rdquo;
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card title="Last time">
        {ingest.previousWeakSpots.length > 0 ? (
          <div className="space-y-2 text-sm">
            <p className="text-zinc-300">You struggled with these. The interview opens by retesting the first {Math.min(2, ingest.previousWeakSpots.length)}.</p>
            <ul className="list-disc space-y-1 pl-5 text-zinc-200">
              {ingest.previousWeakSpots.map((spot) => (
                <li key={spot.topic}>
                  {spot.topic} <span className="text-zinc-500">({spot.lastScore}/4 on {spot.sessionDate})</span>
                </li>
              ))}
            </ul>
            <button onClick={props.onForget} className="text-zinc-400 underline underline-offset-2 hover:text-white">
              Forget this project
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-400">{ingest.memory.enabled ? "No earlier session for this project yet." : ingest.memory.label}</p>
        )}
      </Card>

      <Card title="Anything wrong?">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder='One correction, for example "the frontend was my teammate&apos;s work"'
            maxLength={300}
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
          />
          <Button variant="ghost" disabled={props.busy || correction.trim() === ""} onClick={() => props.onCorrect(correction.trim())}>
            Update brief
          </Button>
        </div>
      </Card>

      {props.error ? <ErrorNote message={props.error} /> : null}

      <Button disabled={props.busy} onClick={props.onBegin}>
        {props.busy ? "Starting..." : "Start the interview"}
      </Button>
    </div>
  );
}
