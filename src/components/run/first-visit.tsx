import { Composer } from "./composer";
import type { ComposerData } from "./home-data";

// Home with no run open: one question in display type, the composer under it, the saved automations as tokens.
// No example prompts (his rule: free text, no presets).
export function FirstVisit({ composer }: { composer: ComposerData }) {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-6.5rem)] max-w-[52rem] flex-col items-center rounded-[22px] bg-paper px-5 pt-[16vh] pb-10 shadow-sheet min-[900px]:px-12">
      <h1 id="brief-question" className="display text-center text-[34px] min-[900px]:text-[44px]">
        What should the agent do?
      </h1>
      <div className="mt-8 w-full max-w-[40rem] min-[900px]:mt-10">
        <Composer variant="hero" {...composer} />
      </div>
    </section>
  );
}
