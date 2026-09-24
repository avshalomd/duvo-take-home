import { Composer } from "./composer";
import type { ComposerData, FileFacts } from "./home-data";
import { cn } from "@/lib/utils";
import { RunPanel } from "./run-panel";
import { COMPOSER_DOCK, SHEET } from "./sheet";
import type { RunView } from "./types";

// UX QA U1: with Ask for a change open there were two boxes, and Send the change sat under the floating composer. While
// a change is being written (data-asking, ActionsRow) the composer sinks and fades out of the way, and comes back when
// the change is sent or dropped. invisible after the fade: out of the tab order, and hidden from a screen reader. Under
// reduced motion only the fade is left.
const STEPS_ASIDE =
  "transition-[opacity,translate,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-has-[[data-asking]]/sheet:invisible group-has-[[data-asking]]/sheet:translate-y-3 group-has-[[data-asking]]/sheet:opacity-0 motion-reduce:translate-y-0";

// An open run: one paper sheet with the run, and the composer floating at its bottom for the next brief. The
// panel is keyed by the run, so opening another one starts it fresh, while the composer below stays the same
// element across runs.
export function RunSheet({
  view,
  title,
  parentTitle,
  automationName,
  verdictLine,
  facts,
  connections,
  composer,
}: {
  view: RunView;
  title: string;
  parentTitle: string | null;
  automationName: string | null;
  verdictLine: string | null;
  facts: FileFacts;
  connections: { name: string }[];
  composer: ComposerData;
}) {
  return (
    // data-sheet: the handover measures the new run's title width from the sheet the composer sits in. group/sheet: the
    // composer's dock steps aside while the run's Ask for a change is open (the dock's classes)
    <article data-sheet className={cn(SHEET, "group/sheet")}>
      <RunPanel
        key={view.run.id}
        view={view}
        title={title}
        parentTitle={parentTitle}
        automationName={automationName}
        verdictLine={verdictLine}
        facts={facts}
        connections={connections}
      />
      <div className={cn(COMPOSER_DOCK, STEPS_ASIDE)}>
        <Composer variant="floating" {...composer} />
      </div>
    </article>
  );
}
