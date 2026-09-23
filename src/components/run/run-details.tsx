import type { RunView } from "./types";
import { IntentSection } from "./intent-section";
import { isTerminal } from "./poll";
import { StateSection } from "./state-section";
import { TimelineSection } from "./timeline-section";
import { VerdictSection } from "./verdict-section";

// Everything technical about a run, inside the Details panel: the glance view answers "did it work", this answers
// "what exactly did it do", which is the question you only ask when something looks wrong. Monospace lives here only.
export function RunDetails({ view, storedOutcome, connections }: { view: RunView; storedOutcome: string | null; connections: { name: string }[] }) {
  const { run, state, events, verdict } = view;

  return (
    <div data-testid="run-details">
      <IntentSection prompt={run.prompt} plan={state.plan} finished={isTerminal(run.status)} />
      <StateSection state={state} connections={connections} />
      <TimelineSection events={events} connections={connections} />
      <VerdictSection verdict={verdict} storedOutcome={storedOutcome} connections={connections} runStatus={run.status} />
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 border-t border-hairline px-6 py-4 text-[12px] text-slate">
        <dt>Run id</dt>
        <dd className="font-mono break-all">{run.id}</dd>
        <dt>Started as</dt>
        <dd>{run.purpose ?? "adhoc"}</dd>
        {run.parentRunId && (
          <>
            <dt>Follows up</dt>
            <dd className="font-mono break-all">{run.parentRunId}</dd>
          </>
        )}
        {run.automationId && (
          <>
            <dt>Automation</dt>
            <dd className="font-mono break-all">
              {run.automationId}
              {run.automationVersion != null && ` (version ${run.automationVersion})`}
            </dd>
          </>
        )}
        {run.input && (
          <>
            <dt>Input</dt>
            <dd className="break-all">{run.input}</dd>
          </>
        )}
        <dt>Model</dt>
        <dd className="font-mono">{run.model}</dd>
        <dt>Turns</dt>
        <dd className="tabular-nums">{run.numTurns ?? "-"}</dd>
        {run.cancelRequested && (
          <>
            <dt>Stop</dt>
            <dd>requested</dd>
          </>
        )}
        {run.error && (
          <>
            <dt>Raw error</dt>
            <dd className="font-mono break-all text-crimson">{run.error}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
