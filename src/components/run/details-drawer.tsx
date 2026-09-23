"use client";

import { PanelRight, Scale } from "lucide-react";
import { useActionState } from "react";
import { reevaluateAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { RunDetails } from "./run-details";
import type { RunView } from "./types";

// Details is a drawer, not a block under the run: the glance view stays calm, and the technical view - timeline,
// state, ids, cost, the raw verdict with its probabilities, the guards' decisions - is one click away on the right.
export function DetailsDrawer({ view, connections }: { view: RunView; connections: { name: string }[] }) {
  const [judged, reevaluate, judging] = useActionState(reevaluateAction, {});
  const { run, files } = view;
  // nothing to judge before the run ends, or when it produced neither a report nor a file
  const canJudge = (run.status === "succeeded" || run.status === "failed") && Boolean(run.report || files.length);

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            // the same focus ring as the rail's rows (Q71); 40 px tall on a phone (Q75)
            className="text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-[899px]:h-10"
          />
        }
      >
        <PanelRight aria-hidden />
        Details
      </SheetTrigger>
      {/* full width on a phone; a wide drawer on a desk, because the timeline is long lines */}
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Details</SheetTitle>
          <SheetDescription>How the agent read the task, every step it took, and how the result was judged.</SheetDescription>
          <form action={reevaluate} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="runId" value={run.id} />
            <Button type="submit" size="sm" variant="outline" disabled={judging || !canJudge}>
              <Scale className={cn(judging && "animate-pulse")} aria-hidden />
              {judging ? "Checking..." : "Check the result again"}
            </Button>
            {judged.error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {judged.error}
              </p>
            )}
          </form>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RunDetails view={view} connections={connections} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
