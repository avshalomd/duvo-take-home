"use client";

import { useActionState } from "react";
import { reevaluateAction, startRunAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilesSection } from "./files-section";
import { IntentSection } from "./intent-section";
import { PlanSection } from "./plan-section";
import { StateSection } from "./state-section";
import { StatusBadge } from "./status-badge";
import { TimelineSection } from "./timeline-section";
import type { RunView } from "./types";
import { useRunPoll } from "./use-run-poll";
import { VerdictSection } from "./verdict-section";

// The panel reads top to bottom the way the run happened: how it read the task, what it planned, where it is,
// what it did, what it produced, and only then the judgment.
export function RunPanel({ view: initial, connections }: { view: RunView; connections: { name: string }[] }) {
  const view = useRunPoll(initial); // live while the run is running, the server's render otherwise
  const [again, runAgain, starting] = useActionState(startRunAction, {});
  const [judged, reevaluate, judging] = useActionState(reevaluateAction, {});
  const { run, state, events, files, verdict } = view;
  const error = again.error ?? judged.error;

  return (
    <div data-testid="run-panel" className="rounded-xl border bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <h2 className="font-mono text-sm font-semibold">{run.id}</h2>
        <StatusBadge status={run.status} />
        <span className="text-xs text-muted-foreground">{run.model}</span>
        <div className="ml-auto flex items-center gap-2">
          <form action={runAgain}>
            <input type="hidden" name="prompt" value={run.prompt} />
            <Button type="submit" size="sm" variant="outline" disabled={starting}>
              {starting ? "Starting..." : "Run again"}
            </Button>
          </form>
          <form action={reevaluate}>
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" size="sm" variant="outline" disabled={judging}>
              {judging ? "Evaluating..." : "Re-evaluate"}
            </Button>
          </form>
        </div>
      </header>

      {error && (
        <Alert variant="destructive" className="m-4 w-auto">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <IntentSection prompt={run.prompt} plan={state.plan} />
      <PlanSection plan={state.plan} />
      <StateSection state={state} />
      <TimelineSection events={events} connections={connections} />
      <FilesSection runId={run.id} files={files} />
      <VerdictSection verdict={verdict} />

      {run.report && (
        <div className="border-t px-4 py-3">
          <p className="mb-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Report</p>
          <p className="text-sm whitespace-pre-wrap">{run.report}</p>
        </div>
      )}
    </div>
  );
}
