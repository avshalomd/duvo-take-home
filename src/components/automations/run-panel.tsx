"use client";

import { ChevronDown, RotateCw, Scale } from "lucide-react";
import { useActionState, useState } from "react";
import { reevaluateAction, startRunAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Elapsed } from "./elapsed";
import { FilesSection } from "./files-section";
import { outcome } from "./outcome";
import { PlanStepper } from "./plan-stepper";
import { Report } from "./report";
import { ResultSection } from "./result-section";
import { RunDetails } from "./run-details";
import { StatusDot } from "./status-dot";
import { TimeAgo } from "./time-ago";
import type { RunView } from "./types";
import { useRunPoll } from "./use-run-poll";

// The panel answers three questions in order: what was asked, how far the agent has got, and how it turned out.
// Anything a non-technical reader would not use - ids, tools, costs, probabilities - lives under Details.
export function RunPanel({ view: initial, connections }: { view: RunView; connections: { name: string }[] }) {
  const view = useRunPoll(initial); // live while the run is running, the server's render otherwise
  const [again, runAgain, starting] = useActionState(startRunAction, {});
  const [judged, reevaluate, judging] = useActionState(reevaluateAction, {});
  const [details, setDetails] = useState(false);
  const { run, state, files, verdict } = view;

  const terminal = run.status === "succeeded" || run.status === "failed";
  const result = outcome(run.status, verdict?.verdict ?? null);
  const error = again.error ?? judged.error;

  return (
    // id + tabIndex: the "Skip to the run" link at the top of the page lands the cursor here (Q70), and the
    // section is named by the run's own title, so a screen reader announces which run it entered (Q73)
    <section
      id="run"
      tabIndex={-1}
      aria-labelledby="run-title"
      data-testid="run-panel"
      className="rounded-xl border bg-background outline-none"
    >
      {/* not sticky: a sticky header inside the card covered the section under it at some scroll positions */}
      <header className="rounded-t-xl border-b bg-background px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* the instruction is the run's name: an id means nothing to the person who typed the task */}
            <h2 id="run-title" className="truncate text-sm font-semibold" title={run.prompt}>
              {firstLine(run.prompt)}
            </h2>
            {/* role=status: this line changes under the poll, and that change is the news a screen reader needs (Q68) */}
            <p role="status" className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <StatusDot tone={result.tone} />
              <span data-testid="outcome">{result.label}</span>
              <span aria-hidden>-</span>
              {run.status === "running" || run.status === "queued" ? (
                <Elapsed since={run.createdAt} />
              ) : (
                <TimeAgo iso={run.createdAt} />
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <form action={runAgain}>
              <input type="hidden" name="prompt" value={run.prompt} />
              {/* title is the tooltip: an icon button with no words needs one, and the browser's is free */}
              <Button type="submit" size="sm" variant="ghost" disabled={starting || !terminal} title="Run the same instructions again">
                <RotateCw className={cn("size-3.5", starting && "animate-spin")} />
                <span className="sr-only">Run again</span>
              </Button>
            </form>
            <form action={reevaluate}>
              <input type="hidden" name="runId" value={run.id} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                // nothing to judge before the run ends, or when it produced neither a report nor a file
                disabled={judging || !terminal || (!run.report && files.length === 0)}
                title="Check the result again"
              >
                <Scale className={cn("size-3.5", judging && "animate-pulse")} />
                <span className="sr-only">Re-evaluate</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      {error && (
        <p role="alert" className="border-b bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {run.status === "failed" && run.error && (
        <div className="border-b bg-red-500/10 px-4 py-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            The run stopped before it finished. You can run the same instructions again.
          </p>
          {/* the SDK's own words are kept, folded: useful to one reader in ten, alarming to the other nine */}
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-red-700/80 dark:text-red-400/80">Technical detail</summary>
            <p className="mt-1 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap text-red-700/90 dark:text-red-400/90">
              {run.error}
            </p>
          </details>
        </div>
      )}

      <section className="px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">The plan</h3>
        {/* the bar may not say "it went well": that is the verdict's job, so the verdict decides its colour (Q67) */}
        <PlanStepper plan={state.plan} terminal={terminal} verdict={verdict?.verdict ?? null} />
      </section>

      <section data-testid="produced" className="border-t px-4 py-4">
        <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">What it produced</h3>
        <FilesSection runId={run.id} files={files} />
        {run.report && (
          <div className="mt-3">
            <Report text={run.report} />
          </div>
        )}
      </section>

      <section className="border-t px-4 py-4">
        <h3 className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">How it turned out</h3>
        <ResultSection runStatus={run.status} verdict={verdict} />
      </section>

      <button
        type="button"
        onClick={() => setDetails(!details)}
        aria-expanded={details}
        // the same focus ring as the run rows and the buttons (Q71); 40 px tall on a phone (Q75)
        className="flex w-full items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-10"
      >
        Details
        <ChevronDown className={cn("size-4 transition-transform duration-200", details && "rotate-180")} />
      </button>
      {details && <RunDetails view={view} connections={connections} />}
    </section>
  );
}

function firstLine(prompt: string): string {
  const line = prompt.split("\n").find((l) => l.trim()) ?? prompt;
  return line.length > 120 ? `${line.slice(0, 119)}...` : line;
}
