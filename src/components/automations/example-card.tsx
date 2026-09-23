"use client";

import { Download, FileText } from "lucide-react";
import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { StatusDot } from "@/components/run/status-dot";
import { useLiveRun, type LiveRun } from "./use-live-run";
import { VerdictForm } from "./verdict-form";
import { exampleWhy } from "./why";

export type ExampleView = LiveRun & {
  runId: string;
  input: string;
  humanVerdict: "approved" | "rejected" | null;
  humanNote: string | null;
};

const FINISHED = ["succeeded", "failed", "cancelled"];

// One example of the current version: its live status, the automatic outcome with a short why, its files, the way to
// the full run, and the person's own judgment once it has finished.
export function ExampleCard({ automationId, example }: { automationId: string; example: ExampleView }) {
  const run = useLiveRun(example.runId, example);
  const o = outcome(run.status, run.outcome);
  const why = exampleWhy(run.verdict);
  const finished = FINISHED.includes(run.status);

  return (
    <li data-testid="example" className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDot tone={o.tone} />
        <span className="font-medium">{example.input}</span>
        <span data-testid="example-outcome" className="ml-auto text-sm">
          {o.label}
        </span>
      </div>

      {why.length > 0 && (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {why.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {run.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {run.files.map((f) => (
            <li key={f.name}>
              <a
                href={`/api/runs/${example.runId}/files/${encodeURIComponent(f.name)}`}
                download
                aria-label={`Download ${f.name}`}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                <FileText className="size-3.5 text-muted-foreground" />
                {f.name}
                <Download className="size-3 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link href={`/?run=${example.runId}`} className="inline-block text-sm text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
        Open the full run
      </Link>

      {finished ? (
        <VerdictForm
          key={`${example.humanVerdict}-${example.humanNote}`}
          automationId={automationId}
          runId={example.runId}
          succeeded={run.status === "succeeded"}
          verdict={example.humanVerdict}
          note={example.humanNote}
        />
      ) : (
        <p className="text-xs text-muted-foreground">When it has finished, check the result and say whether it looks right.</p>
      )}
    </li>
  );
}
