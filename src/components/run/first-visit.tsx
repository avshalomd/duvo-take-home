import { Thread, type ThreadStep } from "@/components/thread/thread";
import { Composer } from "./composer";
import type { ComposerData } from "./home-data";
import { SHEET } from "./sheet";

// How every run goes, drawn as the thread a run is drawn with: the first screen a new user sees shows the product's
// signature before there is anything to show it on (Q137). Mini, and under the composer, so it never competes with it.
const HOW_A_RUN_GOES: ThreadStep[] = [
  { key: "brief", title: "You describe the task", status: "done" },
  { key: "work", title: "The agent plans it and does the work", status: "running" },
  { key: "result", title: "You get the result, checked", status: "pending" },
];

// Home with no run open: one question, the composer under it, the saved automations as tokens, and how a run goes.
// No example prompts (his rule: free text, no presets). data-sheet: the handover measures the title's width from it.
export function FirstVisit({ composer }: { composer: ComposerData }) {
  return (
    <section
      data-sheet
      className={`${SHEET} flex min-h-[calc(100dvh-6.5rem)] flex-col items-center px-5 pt-[16vh] pb-10 min-[900px]:px-12`}
    >
      <h1 id="brief-question" className="page-title text-center">
        What should the agent do?
      </h1>
      <div className="mt-8 w-full max-w-[40rem] min-[900px]:mt-10">
        <Composer variant="hero" {...composer} />
      </div>
      <Thread steps={HOW_A_RUN_GOES} tone="live" size="mini" label="How a run goes" className="mt-14 w-fit text-slate" />
    </section>
  );
}
