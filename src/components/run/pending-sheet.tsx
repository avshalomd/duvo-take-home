"use client";

import { useEffect, useState } from "react";
import { Thread } from "@/components/thread/thread";
import { Elapsed } from "./elapsed";
import { outcome } from "./outcome";
import { RunTitle } from "./run-title";
import { SHEET, SHEET_GUTTER } from "./sheet";
import { StatusDot } from "./status-dot";
import { threadSteps } from "./thread-steps";

/**
 * The new run's sheet, up at the press of Run while the server is still starting the run (Q138). It is laid out
 * exactly like the top of a live run's sheet (RunPanel) - the title where the brief lands, the status line, the
 * thread on its first step - so when the real run replaces it a moment later, nothing on screen moves.
 */
export function PendingSheet({ title, onShown }: { title: string; onShown: () => void }) {
  // the composer waits for this before it asks the server: see Composer.onSubmit
  useEffect(onShown, [onShown]);
  const [pressedAt] = useState(() => new Date().toISOString()); // the clock a live run shows, from the press
  const status = outcome("queued", null); // what a new run says while it gets ready

  return (
    <article data-testid="run-pending" aria-busy className={SHEET}>
      <header className={`${SHEET_GUTTER} pt-6 min-[900px]:pt-9`}>
        <div className="flex min-h-9 items-center">
          <span className="text-[13px] tracking-[0.01em] text-slate">
            <Elapsed since={pressedAt} />
          </span>
        </div>
        <RunTitle title={title} brief={title} id="pending-title" handover />
        <div className="mt-4 flex items-center">
          <p role="status" className="flex items-center gap-2.5 text-[15px]">
            <StatusDot tone={status.tone} className="size-2.5" />
            <span className="font-medium">{status.label}</span>
          </p>
        </div>
      </header>
      <section aria-label="The plan" className={`${SHEET_GUTTER} pt-8 pb-10`}>
        <div className="mb-5 flex items-baseline">
          <h2 className="text-[17px] font-semibold">The plan</h2>
        </div>
        <Thread steps={threadSteps(null, "queued", [])} tone="live" />
      </section>
    </article>
  );
}
