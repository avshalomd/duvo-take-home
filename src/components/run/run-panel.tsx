"use client";

import { RotateCw } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { cancelRunAction, startRunAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DetailsDrawer } from "./details-drawer";
import { Elapsed } from "./elapsed";
import { FilesSection } from "./files-section";
import { GuardNotices } from "./guard-notices";
import { NextSection } from "./next-section";
import { outcome } from "./outcome";
import { PlanStepper } from "./plan-stepper";
import { isTerminal, shouldPoll } from "./poll";
import { Report } from "./report";
import { RunNotes } from "./run-notes";
import { StatusDot } from "./status-dot";
import { StopButton } from "./stop-button";
import { TimeAgo } from "./time-ago";
import type { RunView } from "./types";
import { useRunPoll } from "./use-run-poll";
import { whyLines } from "./why";
import { WhyButton, WhyList } from "./why-section";

// The run column answers three questions in order: what was asked, how far the agent has got, and how it turned
// out - each in one plain sentence. Anything a non-technical reader would not use - ids, tools, costs,
// probabilities, raw errors - is in the Details drawer.
export function RunPanel({
  view: initial,
  connections,
  parentTitle,
}: {
  view: RunView;
  connections: { name: string }[];
  parentTitle: string | null;
}) {
  const view = useRunPoll(initial); // live while the run is going, the server's render otherwise
  const [again, runAgain, starting] = useActionState(startRunAction, {});
  const [stop, requestStop, stopping] = useActionState(cancelRunAction, {});
  const [whyOpen, setWhyOpen] = useState(false);
  const { run, state, files, verdict } = view;

  const live = shouldPoll(run.status);
  const terminal = isTerminal(run.status);
  // the full verdict when it parsed, else the headline stored on the run, so the rail and the run agree
  const headline = verdict?.verdict ?? run.outcome ?? null;
  const result = outcome(run.status, headline, run.cancelRequested);
  const why = whyLines(verdict, run.status);
  const error = again.error ?? stop.error;

  return (
    // id + tabIndex: the "Skip to the run" link lands the cursor here (Q70), and the section is named by the run's
    // own title, so a screen reader announces which run it entered (Q73)
    <section id="run" tabIndex={-1} aria-labelledby="run-title" data-testid="run-panel" className="rounded-xl border bg-background shadow-xs outline-none">
      <header className="rounded-t-xl border-b px-4 py-3">
        <div className="flex items-start gap-3 max-sm:flex-col max-sm:gap-2">
          <div className="min-w-0 flex-1">
            {/* the instruction is the run's name: an id means nothing to the person who typed the task */}
            <h2 id="run-title" className="line-clamp-2 text-base font-semibold leading-snug" title={run.prompt}>
              {firstLine(run.prompt)}
            </h2>
            <RunNotes run={run} parentTitle={parentTitle} />
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* role=status: this line changes as the run moves, and that change is the news a screen reader needs (Q68) */}
              <p role="status" className="flex items-center gap-2 text-sm">
                <StatusDot tone={result.tone} />
                <span data-testid="outcome" className="font-medium">
                  {result.label}
                </span>
                <span aria-hidden className="text-muted-foreground">
                  -
                </span>
                <span className="text-muted-foreground">{live ? <Elapsed since={run.createdAt} /> : <TimeAgo iso={run.createdAt} />}</span>
              </p>
              {why.length > 0 && <WhyButton open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} />}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {live && <StopButton runId={run.id} action={requestStop} pending={stopping} stopping={Boolean(run.cancelRequested)} />}
            {terminal && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  startTransition(() => runAgain(data));
                }}
              >
                <input type="hidden" name="prompt" value={run.prompt} />
                {/* title is the tooltip: an icon button with no words needs one, and the browser's is free */}
                <Button type="submit" size="sm" variant="ghost" disabled={starting} title="Run the same instructions again" className="max-[899px]:h-10">
                  <RotateCw className={cn("size-3.5", starting && "animate-spin")} aria-hidden />
                  <span className="sr-only">Run again</span>
                </Button>
              </form>
            )}
            <DetailsDrawer view={view} connections={connections} />
          </div>
        </div>
      </header>

      {whyOpen && why.length > 0 && <WhyList lines={why} />}

      {error && (
        <p role="alert" className="border-b bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {run.status === "failed" && (
        <p className="border-b bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400">
          The run stopped before it finished. You can run the same instructions again; what went wrong is in Details.
        </p>
      )}

      <GuardNotices guards={state.guards} />

      <section className="px-4 py-4">
        <h3 className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">The plan</h3>
        {/* the bar may not say "it went well": that is the verdict's job, so the verdict decides its colour (Q67) */}
        <PlanStepper plan={state.plan} runStatus={run.status} verdict={headline} stepChecks={state.stepChecks} />
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

      {terminal && <NextSection run={run} verdict={verdict} />}
    </section>
  );
}

function firstLine(prompt: string): string {
  const line = prompt.split("\n").find((l) => l.trim()) ?? prompt;
  return line.length > 160 ? `${line.slice(0, 159)}...` : line;
}
