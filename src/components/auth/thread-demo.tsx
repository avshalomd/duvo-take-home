"use client";

import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Thread, type ThreadStep } from "@/components/thread/thread";

// The sign-in pages' illustration: one real-sounding task, drawn once through its three steps the way a run is
// drawn on Home. Made-up data, so nothing here is read from the database.
const BRIEF = "Total last week's supplier invoices by supplier";
const STEPS = [
  { title: "Open the invoices in the shared folder", note: "38 invoices from 14 suppliers" },
  { title: "Add them up by supplier", note: "The largest is Nordlicht GmbH, at €12,480" },
  { title: "Write invoice-totals.csv", note: "14 rows, one per supplier" },
];
const FIRST_STEP_MS = 900; // long enough to see the first step start before it finishes
const STEP_MS = 1300;

/** How far the example has got: the index of the running step, or STEPS.length once all are done. */
function useProgress(): number {
  const [reached, setReached] = useState(0);
  useEffect(() => {
    if (reached >= STEPS.length) return; // drawn once, then it stays done
    const timer = setTimeout(() => setReached((r) => r + 1), reached === 0 ? FIRST_STEP_MS : STEP_MS);
    return () => clearTimeout(timer);
  }, [reached]);
  return reached;
}

function steps(reached: number, withNotes: boolean): ThreadStep[] {
  return STEPS.map((s, i) => ({
    key: i,
    title: s.title,
    status: i < reached ? "done" : i === reached ? "running" : "pending",
    note: withNotes && i < reached ? s.note : undefined, // a note appears when its step is done, as on a real run
  }));
}

export function ThreadDemo() {
  const reached = useProgress();
  const done = reached >= STEPS.length;
  const tone = done ? "done" : "live";
  // Two sizes of the same example, one shown per screen width by CSS, so the first paint is already the right one.
  return (
    <>
      <div className="hidden rounded-[22px] bg-paper p-7 shadow-sheet lg:block">
        <p className="display text-[24px] leading-[1.15]">{BRIEF}</p>
        <Thread steps={steps(reached, true)} tone={tone} className="mt-6" label="An example of the agent at work" />
        <p className={done ? "mt-6 flex items-center gap-2 text-[15px] font-medium text-fern" : "mt-6 text-[15px] text-slate"}>
          {done && <Check aria-hidden strokeWidth={3} className="size-4" />}
          {done ? "Done, and invoice-totals.csv is ready." : "Working on it"}
        </p>
      </div>
      <Thread steps={steps(reached, false)} tone={tone} size="mini" className="lg:hidden" label="An example of the agent at work" />
    </>
  );
}
