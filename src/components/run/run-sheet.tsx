import { Composer } from "./composer";
import type { ComposerData, FileFacts } from "./home-data";
import { RunPanel } from "./run-panel";
import { SHEET } from "./sheet";
import type { RunView } from "./types";

// An open run: one paper sheet with the run, and the composer floating at its bottom for the next brief. The
// panel is keyed by the run, so opening another one starts it fresh, while the composer below stays the same
// element across runs.
export function RunSheet({
  view,
  title,
  parentTitle,
  automationName,
  facts,
  connections,
  composer,
}: {
  view: RunView;
  title: string;
  parentTitle: string | null;
  automationName: string | null;
  facts: FileFacts;
  connections: { name: string }[];
  composer: ComposerData;
}) {
  return (
    // data-sheet: the handover measures the new run's title width from the sheet the composer sits in
    <article data-sheet className={SHEET}>
      <RunPanel key={view.run.id} view={view} title={title} parentTitle={parentTitle} automationName={automationName} facts={facts} connections={connections} />
      {/* the fade above the capsule is where the run meets it: the content eases out instead of ending on a line */}
      <div className="sticky bottom-0 z-20 rounded-b-[22px] bg-[linear-gradient(to_top,var(--paper)_45%,transparent)] px-3 pt-8 pb-3 min-[900px]:px-8 min-[900px]:pb-6">
        <Composer variant="floating" {...composer} />
      </div>
    </article>
  );
}
