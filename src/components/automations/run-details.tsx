import type { RunView } from "./types";
import { IntentSection } from "./intent-section";
import { StateSection } from "./state-section";
import { TimelineSection } from "./timeline-section";
import { VerdictSection } from "./verdict-section";

// Everything technical about a run in one place, folded away by default: the overview above answers "did it work",
// this answers "what exactly did it do", which is the question you only ask when something looks wrong.
export function RunDetails({ view, connections }: { view: RunView; connections: { name: string }[] }) {
  const { run, state, events, verdict } = view;

  return (
    <div data-testid="run-details" className="border-t bg-muted/20">
      <IntentSection prompt={run.prompt} plan={state.plan} />
      <StateSection state={state} />
      <TimelineSection events={events} connections={connections} />
      <VerdictSection verdict={verdict} />
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
        <dt>Run id</dt>
        <dd className="font-mono break-all">{run.id}</dd>
        <dt>Model</dt>
        <dd className="font-mono">{run.model}</dd>
        {run.error && (
          <>
            <dt>Raw error</dt>
            <dd className="font-mono break-all text-red-600 dark:text-red-400">{run.error}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
