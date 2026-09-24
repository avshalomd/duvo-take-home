"use client";

import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { Thread, threadTone, type ThreadStep } from "@/components/thread/thread";
import { cn } from "@/lib/utils";
import { DOT } from "./dot";
import { ExampleFiles } from "./example-files";
import { LINK, SMALL, TILE } from "./surfaces";
import { useLiveRun, type LiveRun } from "./use-live-run";
import { VerdictForm } from "./verdict-form";

export type ExampleView = LiveRun & {
  runId: string;
  input: string;
  humanVerdict: "approved" | "rejected" | null;
  humanNote: string | null;
  said: string | null; // the judgment in words, as who made it: "You said it looks right", "Mia said...", "Marked as ..."
  changeLabel: string; // the control that changes it: "Change", or whose judgment it replaces
};

const FINISHED = ["succeeded", "failed", "cancelled"];

// One example of the current version: its input, a mini thread of the agent's plan, the outcome in one line, what it
// made, the way to the full run, and the person's own judgment once it has finished.
export function ExampleCard({ automationId, example }: { automationId: string; example: ExampleView }) {
  const run = useLiveRun(example.runId, example);
  const o = outcome(run.status, run.outcome);
  const tone = threadTone(run.status, run.outcome);
  const finished = FINISHED.includes(run.status);
  const steps: ThreadStep[] = (run.plan?.steps ?? []).map((s) => ({ key: s.index, title: s.title, status: s.status }));

  return (
    <li data-testid="example" className={cn(TILE, "space-y-4 p-5")}>
      <p className="text-[17px] leading-6 font-semibold text-graphite">{example.input}</p>

      {steps.length > 0 ? (
        <Thread steps={steps} tone={tone} size="mini" label={`Plan for ${example.input}`} />
      ) : (
        <p className={SMALL}>{finished ? "No plan was recorded." : "Reading the brief..."}</p>
      )}

      <p data-testid="example-outcome" className="flex items-center gap-2 text-[15px] text-graphite">
        <span aria-hidden className={cn("size-2 rounded-full", DOT[o.tone])} />
        {o.label}
      </p>

      <ExampleFiles runId={example.runId} files={run.files} />

      <Link href={`/?run=${example.runId}`} className={cn(LINK, "inline-block text-[15px]")}>
        Open the full run
      </Link>

      {finished ? (
        <VerdictForm
          key={`${example.humanVerdict}-${example.humanNote}-${example.said}`}
          automationId={automationId}
          runId={example.runId}
          succeeded={run.status === "succeeded"}
          verdict={example.humanVerdict}
          note={example.humanNote}
          said={example.said}
          changeLabel={example.changeLabel}
        />
      ) : (
        <p className={SMALL}>When it has finished, check what it made and say whether it looks right.</p>
      )}
    </li>
  );
}
