"use client";

/** Screen 1: choose a repo and how you want to be interviewed. */
import { useState } from "react";
import type { Persona, Settings } from "@/lib/interview/schemas";
import { Button, Card, ErrorNote } from "./ui";

export type Sample = { id: string; label: string; description: string };

export type StartChoice = { target: string; settings: Pick<Settings, "persona" | "mainQuestions" | "targetRole"> };

export function StartScreen(props: {
  localMode: boolean;
  samples: Sample[];
  busy: boolean;
  error: string | null;
  onStart: (choice: StartChoice) => void;
}) {
  const [target, setTarget] = useState("");
  const [persona, setPersona] = useState<Persona>("tough");
  const [mainQuestions, setMainQuestions] = useState(6);
  const [targetRole, setTargetRole] = useState("Software engineer (campus placement)");

  const start = (chosen: string) => props.onStart({ target: chosen, settings: { persona, mainQuestions, targetRole } });

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Viva</h1>
        <p className="max-w-2xl text-zinc-300">
          A mock technical interview about <em>your</em> project. Viva reads your repo, finds the parts an AI agent wrote, and questions you the way a placement
          interviewer would.
        </p>
      </header>

      <Card title="Your project">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            start(target);
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm text-zinc-300">{props.localMode ? "GitHub URL or a folder on this computer" : "Public GitHub repository URL"}</span>
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={props.localMode ? "https://github.com/you/project  or  C:\\projects\\my-app" : "https://github.com/you/project"}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-600"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-300">Interviewer</span>
              <select value={persona} onChange={(event) => setPersona(event.target.value as Persona)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                <option value="tough">Tough tech lead</option>
                <option value="friendly">Friendly HR round</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-300">Main questions: {mainQuestions}</span>
              <input type="range" min={5} max={12} value={mainQuestions} onChange={(event) => setMainQuestions(Number(event.target.value))} className="w-full accent-emerald-600" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-zinc-300">Target role</span>
              <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" />
            </label>
          </div>

          <Button type="submit" disabled={props.busy || target.trim() === ""}>
            {props.busy ? "Reading your repo..." : "Read my project"}
          </Button>
        </form>
      </Card>

      {props.error ? <ErrorNote message={props.error} /> : null}

      <Card title="Or try a sample">
        <div className="grid gap-3 sm:grid-cols-3">
          {props.samples.map((sample) => (
            <button
              key={sample.id}
              disabled={props.busy}
              onClick={() => start(`sample:${sample.id}`)}
              className="rounded-md border border-zinc-800 p-3 text-left transition-colors hover:border-emerald-700 disabled:opacity-50"
            >
              <div className="font-medium">{sample.label}</div>
              <div className="mt-1 text-sm text-zinc-400">{sample.description}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
