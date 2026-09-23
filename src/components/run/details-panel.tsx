"use client";

import { Scale, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useActionState, useEffect, useRef } from "react";
import { reevaluateAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RunDetails } from "./run-details";
import type { RunView } from "./types";

// Critically damped (docs/DESIGN-V2.md): the panel arrives and stops, and a new target mid-flight redirects it.
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

// Details is a parallel panel, not a modal: it slides in from the right over the run, with no scrim, so the run
// beside it stays readable and usable - Why?, the files, the thread. Everything technical lives here: the timeline,
// the state, ids, cost, turns, the raw verdict with its probabilities, the guards' and the checker's decisions.
export function DetailsPanel({
  open,
  onClose,
  view,
  storedOutcome,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  view: RunView;
  storedOutcome: string | null;
  connections: { name: string }[]; // every connection's name, so the timeline says "DeepWiki", not "deepwiki"
}) {
  const reduce = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);
  const [judged, reevaluate, judging] = useActionState(reevaluateAction, {});
  const { run, files } = view;
  // nothing to judge before the run ends, or when it produced neither a report nor a file
  const canJudge = (run.status === "succeeded" || run.status === "failed") && Boolean(run.report || files.length);

  // the keyboard follows the panel in: whoever opened it is now reading it
  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          id="details-panel"
          role="dialog"
          aria-modal={false} // the run beside it stays live: this is a panel, not a modal
          aria-labelledby="details-title"
          // reduced motion: the slide becomes a 150 ms cross-fade (every spring does)
          initial={reduce ? { opacity: 0 } : { x: "100%" }}
          animate={reduce ? { opacity: 1 } : { x: 0 }}
          exit={reduce ? { opacity: 0 } : { x: "100%" }}
          transition={reduce ? { duration: 0.15 } : SPRING}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col bg-paper shadow-float sm:w-[36rem] sm:rounded-l-[22px]"
        >
          <header className="flex items-start gap-3 border-b border-hairline px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <h2 id="details-title" className="text-[19px] font-semibold">
                Details
              </h2>
              <p className="mt-1 text-[13px] tracking-[0.01em] text-slate">How the agent read the brief, every step it took, and how the result was judged.</p>
              <form action={reevaluate} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="runId" value={run.id} />
                <Button type="submit" variant="outline" size="sm" disabled={judging || !canJudge} className="h-8 px-3">
                  <Scale aria-hidden className={cn(judging && "animate-pulse")} />
                  {judging ? "Checking..." : "Check the result again"}
                </Button>
                {judged.error && (
                  <p role="alert" className="text-[13px] text-crimson">
                    {judged.error}
                  </p>
                )}
              </form>
            </div>
            <Button ref={closeButton} type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close details" className="-mr-2 size-9">
              <X aria-hidden />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <RunDetails view={view} storedOutcome={storedOutcome} connections={connections} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
