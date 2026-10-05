"use client";

/** Screen 4: the scored report, with Markdown export. */
import { useState } from "react";
import type { ReportResult } from "@/lib/client/api";
import { Badge, Button, Panel, Section } from "./ui";

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function List({ items, empty, ordered = false }: { items: string[]; empty: string; ordered?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`space-y-2 pl-5 text-sm text-zinc-800 ${ordered ? "list-decimal" : "list-disc"} marker:text-zinc-400`}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </Tag>
  );
}

export function ReportScreen(props: { repoLabel: string; result: ReportResult; memoryLabel: string; onRestart: () => void }) {
  const { report, markdown, savedToMemory } = props.result;
  const [copied, setCopied] = useState(false);
  const answered = report.perQuestion.filter((item) => !item.skipped).length;

  return (
    <div className="space-y-10">
      <header className="space-y-6">
        <div>
          <p className="text-sm text-zinc-500">Interview report</p>
          <h1 className="font-display text-4xl tracking-tight text-zinc-900">{props.repoLabel}</h1>
        </div>

        <Panel className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-6xl leading-none text-zinc-900">{report.overall}</span>
            <span className="text-zinc-500">out of 4</span>
          </div>
          <div className="space-y-1.5">
            <Badge tone={report.overall >= 2.5 ? "good" : "warn"}>{report.readiness}</Badge>
            <p className="text-sm text-zinc-600">
              {report.perQuestion.length} questions, {answered} answered, {report.perQuestion.length - answered} skipped
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadText("viva-report.md", markdown)}>
              Download Markdown
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(markdown);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={props.onRestart}>New interview</Button>
          </div>
        </Panel>
        <p className="text-sm text-zinc-500">{savedToMemory ? "Your weak spots were saved on this computer and will be retested next time." : props.memoryLabel}</p>
      </header>

      {report.progressVsLast.length > 0 ? (
        <Section title="Progress since last session">
          <ul className="divide-y divide-zinc-100">
            {report.progressVsLast.map((item) => (
              <li key={item.topic} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="text-zinc-900">{item.topic}</span>
                <Badge tone={item.after > item.before ? "good" : "warn"}>
                  {item.before}/4 then, {item.after}/4 now
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Weak spots">
          {report.weakSpots.length === 0 ? (
            <p className="text-sm text-zinc-500">No weak spots found.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {report.weakSpots.map((spot) => (
                <li key={spot.topic}>
                  <span className="font-medium text-zinc-900">{spot.topic}</span>
                  <span className="mt-0.5 block text-zinc-600">{spot.evidence}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Revise before the real interview">
          <List items={report.revisionList} empty="Nothing to revise." />
        </Section>
        <Section title="Strengths">
          <List items={report.strengths} empty="Nothing stood out yet." />
        </Section>
        <Section title="Likely next questions">
          <List items={report.likelyNextQuestions} empty="None suggested." ordered />
        </Section>
      </div>

      <Section title="Question by question">
        <ol className="divide-y divide-zinc-100">
          {report.perQuestion.map((item) => (
            <li key={item.questionId} className="space-y-2 py-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={item.skipped ? "neutral" : item.score >= 3 ? "good" : "warn"}>{item.skipped ? "Skipped" : `${item.score}/4`}</Badge>
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{item.round}</span>
                {item.isFollowUp ? <Badge>Follow-up</Badge> : null}
                {item.aboutAiCode ? <Badge tone="ai">AI-written code</Badge> : null}
              </div>
              <p className="text-zinc-900">{item.question}</p>
              <p className="text-sm text-zinc-600">{item.answerSummary}</p>
              {item.good.length > 0 ? (
                <p className="text-sm text-emerald-800">
                  <span className="font-medium">Good:</span> {item.good.join("; ")}
                </p>
              ) : null}
              {item.missing.length > 0 ? (
                <p className="text-sm text-amber-800">
                  <span className="font-medium">Missing:</span> {item.missing.join("; ")}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
