"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Scale, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useActionState, useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { reevaluateAction, type FormState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RunDetails } from "./run-details";
import type { RunView } from "./types";

// Critically damped (docs/DESIGN-V2.md): the panel arrives and stops, and a new target mid-flight redirects it.
const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 };

// Below Tailwind's sm: the panel is as wide as the screen, so it is a sheet over the run rather than beside it
const PHONE = "(max-width: 639.98px)";

type Props = {
  open: boolean;
  onClose: () => void;
  view: RunView;
  storedOutcome: string | null;
  connections: { name: string }[]; // every connection's name, so the timeline says "DeepWiki", not "deepwiki"
  returnFocus: RefObject<HTMLButtonElement | null>; // the Details button, which gets the keyboard back on close
};

// Details holds everything technical: the timeline, the state, ids, cost, turns, the raw verdict with its
// probabilities, the guards' and the checker's decisions. On a desk it is a parallel panel, not a modal: it slides in
// from the right over the run, with no scrim, so the run beside it stays readable and usable - Why?, the files, the
// thread. On a phone it covers the whole run (frontend review 5, his call 2026-09-24): there it is a real modal sheet,
// so Tab cannot walk onto controls hidden under it, and Escape or Close hand the keyboard back to Details.
export function DetailsPanel(props: Props) {
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false); // the server renders the desk's; nothing is open then
  const [judged, reevaluate, judging] = useActionState(reevaluateAction, {});
  const check = { judged, reevaluate, judging };
  return phone ? <PhoneSheet {...props} check={check} /> : <DeskPanel {...props} check={check} />;
}

function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia(PHONE).matches;

type Check = { judged: FormState; reevaluate: (data: FormData) => void; judging: boolean };

function DeskPanel({ open, onClose, view, storedOutcome, connections, check }: Props & { check: Check }) {
  const reduce = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);

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
          className="fixed inset-y-0 right-0 z-40 flex w-[36rem] flex-col rounded-l-[22px] bg-paper shadow-float"
        >
          <DetailsContent view={view} storedOutcome={storedOutcome} connections={connections} check={check} onClose={onClose} closeButton={closeButton} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/**
 * The phone's sheet: Base UI's Dialog, modal, so focus is trapped inside and the run under it is inert. It enters from
 * the right and leaves the same way, as the desk's panel does (spatial consistency), on the iOS sheet curve; with
 * reduced motion the slide becomes a 150 ms cross-fade. Transitions, not keyframes: a close mid-entry reverses from
 * where the sheet is.
 */
function PhoneSheet({ open, onClose, view, storedOutcome, connections, check, returnFocus }: Props & { check: Check }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Popup
          id="details-panel"
          aria-modal="true" // Base UI traps focus and makes the page inert; this says so to a screen reader on entry (Q62)
          aria-labelledby="details-title"
          initialFocus={closeButton}
          finalFocus={returnFocus}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-paper pt-[env(safe-area-inset-top)] outline-none",
            "transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:translate-x-full data-starting-style:translate-x-full",
            "motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:data-ending-style:translate-x-0 motion-reduce:data-ending-style:opacity-0 motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-starting-style:opacity-0",
          )}
        >
          <DetailsContent view={view} storedOutcome={storedOutcome} connections={connections} check={check} onClose={onClose} closeButton={closeButton} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailsContent({
  view,
  storedOutcome,
  connections,
  check,
  onClose,
  closeButton,
}: Pick<Props, "view" | "storedOutcome" | "connections" | "onClose"> & { check: Check; closeButton: RefObject<HTMLButtonElement | null> }) {
  const { run, files } = view;
  // nothing to judge before the run ends, or when it produced neither a report nor a file
  const canJudge = (run.status === "succeeded" || run.status === "failed") && Boolean(run.report || files.length);
  return (
    <>
      <header className="flex items-start gap-3 border-b border-hairline px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h2 id="details-title" className="text-[19px] font-semibold">
            Details
          </h2>
          <p className="mt-1 text-[13px] tracking-[0.01em] text-slate">How the agent read the brief, every step it took, and how the result was judged.</p>
          <form action={check.reevaluate} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" variant="outline" size="sm" disabled={check.judging || !canJudge} className="h-8 px-3">
              <Scale aria-hidden className={cn(check.judging && "animate-pulse")} />
              {check.judging ? "Checking..." : "Check the result again"}
            </Button>
            {check.judged.error && (
              <p role="alert" className="text-[13px] text-crimson">
                {check.judged.error}
              </p>
            )}
          </form>
        </div>
        <Button ref={closeButton} type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close details" className="-mr-2 size-9 max-[639px]:size-11">
          <X aria-hidden />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        <RunDetails view={view} storedOutcome={storedOutcome} connections={connections} />
      </div>
    </>
  );
}
