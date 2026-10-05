"use client";

/** Screen 1: choose a repo and how you want to be interviewed. */
import { useState } from "react";
import type { Persona, Settings } from "@/lib/interview/schemas";
import { Button, ErrorNote, Field, Panel, Section, inputClass } from "./ui";

export type Sample = { id: string; label: string; description: string };

export type StartChoice = { target: string; settings: Pick<Settings, "persona" | "mainQuestions" | "targetRole"> };

const PERSONAS: { id: Persona; label: string; description: string }[] = [
  { id: "tough", label: "Tough tech lead", description: "Direct. Asks why, what breaks, and what the alternative was." },
  { id: "friendly", label: "Friendly HR round", description: "Warm. Cares whether you can explain your work clearly." },
];

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
  // Which button was pressed, so only that one shows the "reading" state.
  const [chosen, setChosen] = useState<string | null>(null);

  const start = (value: string) => {
    setChosen(value);
    props.onStart({ target: value, settings: { persona, mainQuestions, targetRole } });
  };

  return (
    <div className="space-y-12">
      <header className="max-w-2xl space-y-4">
        <h1 className="font-display text-4xl leading-tight tracking-tight text-zinc-900 sm:text-5xl">Can you explain the code you shipped?</h1>
        <p className="text-lg text-zinc-600">
          Viva reads your project, finds the parts an AI agent wrote, and interviews you about it the way a placement panel would. You get follow-ups on what you
          actually said, and a scored report at the end.
        </p>
      </header>

      <form
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          start(target);
        }}
      >
        <Section title="1. Your project">
          <Field
            label={props.localMode ? "GitHub URL, or a folder on this computer" : "Public GitHub repository URL"}
            hint="Viva reads the README, manifests and main source files. Reading a new repo takes about 45 seconds."
          >
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={props.localMode ? "https://github.com/you/project   or   C:\\projects\\my-app" : "https://github.com/you/project"}
              className={inputClass}
              autoFocus
            />
          </Field>
        </Section>

        <Section title="2. Your interviewer">
          <div className="grid gap-3 sm:grid-cols-2">
            {PERSONAS.map((option) => (
              <label
                key={option.id}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  persona === option.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                <input type="radio" name="persona" value={option.id} checked={persona === option.id} onChange={() => setPersona(option.id)} className="sr-only" />
                <span className="block font-medium text-zinc-900">{option.label}</span>
                <span className="mt-1 block text-sm text-zinc-600">{option.description}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-6 pt-2 sm:grid-cols-2">
            <Field label={`Main questions: ${mainQuestions}`} hint="Follow-ups come on top. Six takes about ten minutes.">
              <input type="range" min={5} max={12} value={mainQuestions} onChange={(event) => setMainQuestions(Number(event.target.value))} className="w-full accent-zinc-900" />
            </Field>
            <Field label="Role you are interviewing for">
              <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className={inputClass} />
            </Field>
          </div>
        </Section>

        {props.error ? <ErrorNote message={props.error} /> : null}

        <Button type="submit" disabled={props.busy || target.trim() === ""} className="px-6">
          {props.busy && chosen === target ? "Reading your repo..." : "Read my project"}
        </Button>
      </form>

      <Section title="Or try a sample project" aside="Opens instantly">
        <div className="grid gap-3 sm:grid-cols-3">
          {props.samples.map((sample) => {
            const value = `sample:${sample.id}`;
            return (
              <button key={sample.id} disabled={props.busy} onClick={() => start(value)} className="group text-left disabled:opacity-60">
                <Panel className="h-full transition-colors group-hover:border-zinc-900">
                  <div className="font-medium text-zinc-900">{props.busy && chosen === value ? "Opening..." : sample.label}</div>
                  <div className="mt-1.5 text-sm text-zinc-600">{sample.description}</div>
                </Panel>
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
