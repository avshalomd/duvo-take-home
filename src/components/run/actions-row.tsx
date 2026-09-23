"use client";

import { MessageSquarePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Verdict } from "@/contracts/eval";
import type { Run } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { FollowUpForm } from "./follow-up-form";
import { RunAgainButton } from "./run-again-button";
import { canMakeAutomation, changeSuggestion } from "./run-actions";

const quiet =
  "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[14px] font-medium text-graphite transition-[background-color,transform] duration-100 hover:bg-mist active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:h-10";

// What the person can do with a finished run, as one quiet row at the end of it: turn it into an automation, ask
// for a change, or run the same brief again (a failed run offers that in its banner instead).
export function ActionsRow({ run, verdict, headline }: { run: Run; verdict: Verdict | null; headline: string | null }) {
  const [asking, setAsking] = useState(false);
  const suggestion = verdict?.review?.changeNeeded ?? null;
  const draft = changeSuggestion(verdict); // a result that did not pass: the box opens on what to fix first

  return (
    <div className="border-t border-hairline px-6 py-5 min-[900px]:px-12">
      <div data-testid="run-actions" className="-mx-3.5 flex flex-wrap items-center gap-1">
        {canMakeAutomation(run, headline) && (
          <Link href={`/automations/new?run=${run.id}`} className={quiet}>
            <Sparkles aria-hidden className="size-4 text-saffron" />
            Make an automation
          </Link>
        )}
        <button type="button" onClick={() => setAsking(!asking)} aria-expanded={asking} className={cn(quiet, asking && "bg-mist")}>
          <MessageSquarePlus aria-hidden className="size-4 text-slate" />
          Ask for a change
        </button>
        {run.status !== "failed" && <RunAgainButton prompt={run.prompt} />}
      </div>
      {asking && (
        <div className="mt-4 max-w-[40rem]">
          <FollowUpForm runId={run.id} suggestion={suggestion} draft={draft} />
        </div>
      )}
    </div>
  );
}
