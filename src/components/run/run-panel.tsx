"use client";

import { PanelRight } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { cancelRunAction } from "@/app/(app)/actions";
import { Thread, threadTone } from "@/components/thread/thread";
import { Button } from "@/components/ui/button";
import { ActionsRow } from "./actions-row";
import { DetailsPanel } from "./details-panel";
import { Elapsed } from "./elapsed";
import { failureCause } from "./failure";
import { FilesSection } from "./files-section";
import { GuardNotices } from "./guard-notices";
import { fixesRun, healsOf } from "./heal";
import type { FileFacts } from "./home-data";
import { notCheckedLine, outcome, outcomeHint } from "./outcome";
import { planProgress } from "./plan-progress";
import { isTerminal, shouldPoll } from "./poll";
import { Report } from "./report";
import { RunAgainButton } from "./run-again-button";
import { RunNotes } from "./run-notes";
import { RunTitle } from "./run-title";
import { SHEET_GUTTER } from "./sheet";
import { StatusDot } from "./status-dot";
import { StopButton } from "./stop-button";
import { threadSteps } from "./thread-steps";
import { TimeAgo } from "./time-ago";
import type { RunView } from "./types";
import { useRunPoll } from "./use-run-poll";
import { whyLines } from "./why";
import { NotChecked, WhyButton, WhyList } from "./why-section";

const gutter = SHEET_GUTTER;

// One run on its sheet, for someone who did not write the brief: what was asked (the title), how it turned out (one
// line, and Why?), how the work went (the thread), what it made, and what to do next. Everything technical - ids,
// tools, costs, probabilities, raw errors - is in the Details panel.
export function RunPanel({
  view: initial,
  title,
  parentTitle,
  automationName,
  verdictLine,
  facts,
  connections,
}: {
  view: RunView;
  title: string;
  parentTitle: string | null;
  automationName: string | null;
  verdictLine: string | null; // the person's mark as who made it, worded on the server (it knows the viewer and the judge)
  facts: FileFacts;
  connections: { name: string }[];
}) {
  const view = useRunPoll(initial); // live while the run works, the server's render otherwise
  const [stop, requestStop, stopping] = useActionState(cancelRunAction, {});
  const [whyOpen, setWhyOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const { run, state, files, verdict, events } = view;

  const live = shouldPoll(run.status);
  const terminal = isTerminal(run.status);
  // the full verdict's headline when it parsed, else the one stored on the run: the rail, this line, Why? and
  // Details then all say the same thing, whatever shape the verdict was stored in (Q91)
  const headline = verdict?.verdict ?? run.outcome ?? null;
  // auto-heal's attempts, the last one marked if the engine stopped trying instead of making it (Q148)
  const heals = healsOf(state.heals, events);
  const result = outcome(run.status, headline, run.cancelRequested, { attempts: fixesRun(heals), max: heals.at(-1)?.max });
  const why = whyLines(verdict, run.status, run.outcome, heals);
  const notChecked = notCheckedLine(run.status, headline);
  const hint = outcomeHint(run.status, headline);
  const steps = threadSteps(state.plan, run.status, state.stepChecks, heals);
  const progress = planProgress(state.plan, steps); // counts what the thread draws, fixes included

  function closeDetails() {
    setDetailsOpen(false);
    detailsButton.current?.focus(); // the keyboard goes back to where it was
  }

  return (
    <>
      {/* id + tabIndex: the "Skip to the run" link lands the cursor here (Q70); the section is named by its title */}
      <section id="run" tabIndex={-1} aria-labelledby="run-title" data-testid="run-panel" className="outline-none">
        <header className={`${gutter} pt-6 min-[900px]:pt-9`}>
          <div className="flex min-h-9 items-center gap-2">
            <span className="text-[13px] tracking-[0.01em] text-slate">{live ? <Elapsed since={run.createdAt} /> : <TimeAgo iso={run.createdAt} />}</span>
            <div className="ml-auto flex items-center gap-1.5">
              {live && <StopButton runId={run.id} action={requestStop} pending={stopping} stopping={Boolean(run.cancelRequested)} />}
              <Button
                ref={detailsButton}
                type="button"
                variant="ghost"
                onClick={() => (detailsOpen ? closeDetails() : setDetailsOpen(true))}
                aria-expanded={detailsOpen}
                aria-controls="details-panel"
                // the same focus ring as the rail's rows (Q71)
                className="h-8 px-3 text-slate focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[899px]:h-10"
              >
                <PanelRight aria-hidden />
                Details
              </Button>
            </div>
          </div>

          {/* The brief as the title, two lines at most so the thread below stays in view (Q137); the whole brief is
              its tooltip and the first line of Details. The same element as the one the brief moves into on Run. */}
          <RunTitle title={title} brief={run.prompt} />
          <RunNotes run={run} parentTitle={parentTitle} automationName={automationName} verdictLine={verdictLine} />

          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* role=status: this line changes as the run moves, and that change is the news a screen reader needs (Q68) */}
            <p role="status" className="flex items-center gap-2.5 text-[15px]">
              <StatusDot tone={result.tone} className="size-2.5" />
              <span data-testid="outcome" className="font-medium">
                {result.label}
              </span>
            </p>
            {why.length > 0 && <WhyButton open={whyOpen} onToggle={() => setWhyOpen(!whyOpen)} />}
          </div>
          {/* Q208, qa-ux U7: nobody checked the result (the checker was down, or it never ran): said here, with the way
              to check it again */}
          {notChecked && <NotChecked runId={run.id} line={notChecked} />}
          {/* qa-ai F3: a run that needs the person's answer says how to give it; one that could not be done, where why is */}
          {hint && (
            <p data-testid="outcome-hint" className="mt-2 text-[14px] leading-5 text-slate">
              {hint}
            </p>
          )}
          {whyOpen && why.length > 0 && <WhyList lines={why} />}
        </header>

        <div className={`${gutter} mt-5 space-y-3 empty:hidden`}>
          {stop.error && (
            <p role="alert" className="rounded-[16px] bg-crimson-wash px-4 py-3 text-[14px] text-crimson">
              {stop.error}
            </p>
          )}
          {run.status === "failed" && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[16px] bg-crimson-wash px-4 py-3">
              {/* the cause in one plain sentence when it is one we know; the raw error stays in Details */}
              <p data-testid="failure" className="min-w-0 flex-1 text-[14px] leading-5">
                {failureCause(run.error) ?? "The run stopped before it finished."} You can run the same brief again; the technical detail is in
                Details.
              </p>
              <RunAgainButton runId={run.id} prominent />
            </div>
          )}
          <GuardNotices guards={state.guards} />
        </div>

        <section aria-labelledby="plan-heading" className={`${gutter} pt-8 pb-2`}>
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <h2 id="plan-heading" className="text-[17px] font-semibold">
              The plan
            </h2>
            {progress && (
              <span data-testid="plan-progress" className="text-[13px] tracking-[0.01em] text-slate tabular-nums">
                {progress.label}
              </span>
            )}
          </div>
          {/* before the plan exists, a live run's thread is its first step, reading the brief (Q138) */}
          {steps.length > 0 ? (
            <Thread steps={steps} tone={threadTone(run.status, headline)} />
          ) : (
            <p className="text-[15px] text-slate">The agent never wrote down a plan for this run.</p>
          )}
        </section>

        <section aria-labelledby="made-heading" data-testid="produced" className={`${gutter} pt-8 pb-2`}>
          <h2 id="made-heading" className="mb-4 text-[17px] font-semibold">
            What it made
          </h2>
          <FilesSection runId={run.id} files={files} events={events} facts={facts} status={run.status} hasReport={Boolean(run.report)} />
        </section>

        {run.report && (
          <section aria-labelledby="report-heading" className={`${gutter} pt-8 pb-4`}>
            <h2 id="report-heading" className="mb-3 text-[17px] font-semibold">
              Report
            </h2>
            <Report text={run.report} />
          </section>
        )}

        {terminal && (
          <div className="mt-6">
            <ActionsRow run={run} verdict={verdict} headline={headline} />
          </div>
        )}
      </section>

      <DetailsPanel open={detailsOpen} onClose={closeDetails} view={view} storedOutcome={run.outcome ?? null} connections={connections} />
    </>
  );
}
