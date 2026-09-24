"use client";

import { PanelRight, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Thread } from "@/components/thread/thread";
import { Button } from "@/components/ui/button";
import { ComposerStandIn } from "./composer";
import { Elapsed } from "./elapsed";
import { noFilesLine } from "./file-kind";
import { outcome } from "./outcome";
import { RunTitle } from "./run-title";
import { COMPOSER_DOCK, SHEET, SHEET_GUTTER } from "./sheet";
import { StatusDot } from "./status-dot";
import { threadSteps } from "./thread-steps";

/**
 * The new run's sheet, up at the press of Run while the server is still starting the run (Q138). It is the live run's
 * page (RunSheet with RunPanel) before anything has happened - Stop and Details, the title where the brief lands, the
 * status line, the thread on its first step, What it made, the composer floating at the bottom - so when the real
 * page replaces it a moment later only words change, and nothing moves (UX QA U11: it grew by 110 px).
 */
export function PendingSheet({ title, connections, onShown }: { title: string; connections: string[]; onShown: () => void }) {
  // the composer waits for this before it asks the server: see Composer.onSubmit
  useEffect(onShown, [onShown]);
  const [pressedAt] = useState(() => new Date().toISOString()); // the clock a live run shows, from the press
  const status = outcome("queued", null); // what a new run says while it gets ready

  return (
    <article data-testid="run-pending" aria-busy className={SHEET}>
      <header className={`${SHEET_GUTTER} pt-6 min-[900px]:pt-9`}>
        <div className="flex min-h-9 items-center gap-2">
          <span className="text-[13px] tracking-[0.01em] text-slate">
            <Elapsed since={pressedAt} />
          </span>
          {/* the live run's two buttons, in their places; inert until the run exists, and skipped by a screen reader */}
          <div inert className="ml-auto flex items-center gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 px-3 text-crimson max-[899px]:h-10">
              <Square aria-hidden className="size-3 fill-current" />
              Stop
            </Button>
            <Button type="button" variant="ghost" className="h-8 px-3 text-slate max-[899px]:h-10">
              <PanelRight aria-hidden />
              Details
            </Button>
          </div>
        </div>
        <RunTitle title={title} brief={title} id="pending-title" handover />
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p role="status" className="flex items-start gap-2.5 text-[15px]">
            <StatusDot tone={status.tone} className="mt-1.5 size-2.5" />
            <span className="font-medium">{status.label}</span>
          </p>
        </div>
      </header>
      <section aria-label="The plan" className={`${SHEET_GUTTER} pt-8 pb-2`}>
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">The plan</h2>
        </div>
        <Thread steps={threadSteps(null, "queued", [])} tone="live" />
      </section>
      <section aria-label="What it made" className={`${SHEET_GUTTER} pt-8 pb-2`}>
        <h2 className="mb-4 text-[17px] font-semibold">What it made</h2>
        <p className="text-[15px] text-slate">{noFilesLine("queued", false)}</p>
      </section>
      <div className={COMPOSER_DOCK}>
        <ComposerStandIn connections={connections} />
      </div>
    </article>
  );
}
