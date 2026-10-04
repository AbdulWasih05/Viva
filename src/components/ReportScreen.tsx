"use client";

/** Screen 4: the scored report, with Markdown export. */
import { useState } from "react";
import type { ReportResult } from "@/lib/client/api";
import { Badge, Button, Card } from "./ui";

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-200">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export function ReportScreen(props: { repoLabel: string; result: ReportResult; memoryLabel: string; onRestart: () => void }) {
  const { report, markdown, savedToMemory } = props.result;
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Report: {props.repoLabel}</h1>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => downloadText("viva-report.md", markdown)}>
            Download Markdown
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(markdown);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy Markdown"}
          </Button>
          <Button onClick={props.onRestart}>New interview</Button>
        </div>
      </header>

      <Card>
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="text-4xl font-semibold">{report.overall}</span>
          <span className="text-zinc-400">out of 4</span>
          <Badge tone={report.overall >= 2.5 ? "green" : "amber"}>{report.readiness}</Badge>
        </div>
        <p className="mt-3 text-sm text-zinc-400">{savedToMemory ? "Your weak spots were saved on this computer and will be retested next time." : props.memoryLabel}</p>
      </Card>

      {report.progressVsLast.length > 0 ? (
        <Card title="Progress since last session">
          <ul className="space-y-1.5 text-sm">
            {report.progressVsLast.map((item) => (
              <li key={item.topic} className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-100">{item.topic}</span>
                <Badge tone={item.after > item.before ? "green" : "amber"}>
                  {item.before}/4 then, {item.after}/4 now
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Strengths">
          <List items={report.strengths} empty="Nothing stood out yet." />
        </Card>
        <Card title="Weak spots">
          <List items={report.weakSpots.map((spot) => `${spot.topic}: ${spot.evidence}`)} empty="No weak spots found." />
        </Card>
        <Card title="Revise before the real interview">
          <List items={report.revisionList} empty="Nothing to revise." />
        </Card>
        <Card title="Likely next questions">
          <List items={report.likelyNextQuestions} empty="None suggested." />
        </Card>
      </div>

      <Card title="How you said it">
        <p className="text-sm text-zinc-400">{report.deliverySummary ?? "Delivery feedback (pace, filler words, pauses) is available for voice answers, which arrive in a later phase."}</p>
      </Card>

      <Card title="Question by question">
        <div className="space-y-4">
          {report.perQuestion.map((item) => (
            <div key={item.questionId} className="border-l-2 border-zinc-700 pl-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                <Badge>{item.round}</Badge>
                {item.isFollowUp ? <Badge>follow-up</Badge> : null}
                {item.aboutAiCode ? <Badge tone="violet">AI-written code</Badge> : null}
                <Badge tone={item.score >= 3 ? "green" : "amber"}>{item.skipped ? "skipped" : `${item.score}/4`}</Badge>
              </div>
              <p className="text-sm text-zinc-100">{item.question}</p>
              <p className="mt-1.5 text-sm text-zinc-400">{item.answerSummary}</p>
              {item.good.length > 0 ? <p className="mt-1.5 text-sm text-emerald-300">Good: {item.good.join("; ")}</p> : null}
              {item.missing.length > 0 ? <p className="mt-1 text-sm text-amber-300">Missing: {item.missing.join("; ")}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
