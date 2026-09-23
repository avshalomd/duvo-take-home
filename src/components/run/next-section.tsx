import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { Verdict } from "@/contracts/eval";
import type { Run } from "@/contracts/run";
import { FollowUpForm } from "./follow-up-form";

// What the person can do with a finished run: read what would make it better, ask for a change, or turn the run
// into an automation they can call again with another input.
export function NextSection({ run, verdict }: { run: Run; verdict: Verdict | null }) {
  const suggestion = verdict?.review?.changeNeeded ?? null;
  // only a run that worked is worth repeating; an example or an automation's own run already has an automation
  const canAutomate = run.status === "succeeded" && (run.purpose ?? "adhoc") !== "trial" && run.purpose !== "automation" && run.purpose !== "schedule";

  return (
    <section data-testid="next" className="space-y-4 border-t px-4 py-4">
      <h3 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">What next</h3>

      {suggestion && (
        <p className="rounded-lg border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-sm">
          <span className="font-medium">What would make it better: </span>
          {suggestion}
        </p>
      )}

      <FollowUpForm runId={run.id} suggestion={suggestion} />

      {canAutomate && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-3 py-2.5">
          {/* basis-60: on a phone the sentence keeps its width and the button drops under it */}
          <p className="min-w-0 flex-1 basis-60 text-sm text-muted-foreground">
            Want this again with another input? Save it as a command, like <span className="font-medium text-foreground">\audit Acme Ltd</span>.
          </p>
          <Link
            href={`/automations/new?run=${run.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-sm font-medium hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none max-[899px]:min-h-10"
          >
            <Sparkles className="size-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden />
            Make an automation
          </Link>
        </div>
      )}
    </section>
  );
}
