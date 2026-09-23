import { Composer } from "./composer";
import type { ComposerData, FileFacts } from "./home-data";
import { RunPanel } from "./run-panel";
import type { RunView } from "./types";

// An open run: one paper sheet with the run, and the composer floating at its bottom for the next brief. The
// panel is keyed by the run, so opening another one mounts a new panel - which is what lets its title take part in
// the handover as a new element - while the composer below stays the same element across runs.
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
    <article className="relative mx-auto max-w-[52rem] rounded-[22px] bg-paper shadow-sheet">
      <RunPanel key={view.run.id} view={view} title={title} parentTitle={parentTitle} automationName={automationName} facts={facts} connections={connections} />
      {/* the fade above the capsule is where the run meets it: the content eases out instead of ending on a line */}
      <div className="sticky bottom-0 z-20 rounded-b-[22px] bg-[linear-gradient(to_top,var(--paper)_45%,transparent)] px-3 pt-8 pb-3 min-[900px]:px-8 min-[900px]:pb-6">
        <Composer variant="floating" {...composer} />
      </div>
    </article>
  );
}
