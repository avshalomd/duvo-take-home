import { Check, X } from "lucide-react";
import type { Verdict } from "@/contracts/eval";
import { cn } from "@/lib/utils";
import { outcome } from "./outcome";
import { StatusDot } from "./status-dot";

const pill: Record<string, string> = {
  ok: "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  warn: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
  bad: "border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-300",
  idle: "border-border bg-muted text-muted-foreground",
  busy: "border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300",
};

// How it turned out, for someone who did not write the instructions: one sentence, then what was checked.
// The probabilities, the reasoning and the failed-check details are under Details.
export function ResultSection({ runStatus, verdict }: { runStatus: string; verdict: Verdict | null }) {
  const result = outcome(runStatus, verdict?.verdict ?? null);

  return (
    <div data-testid="result" className="space-y-3">
      <p className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium", pill[result.tone])}>
        <StatusDot tone={result.tone} />
        {result.label}
      </p>

      {verdict?.verdict === "unknown" && (
        <p className="text-sm text-muted-foreground">
          The second model that checks results was unavailable, so this one was not checked. Use the scales button
          above to check it again.
        </p>
      )}

      {verdict && verdict.checks.length > 0 && (
        <ul className="space-y-1.5">
          {verdict.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              {c.ok ? (
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span className={cn(!c.ok && "text-red-700 dark:text-red-400")}>
                {c.label}
                {!c.ok && c.detail && <span className="text-muted-foreground"> - {c.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {verdict?.review?.changeNeeded && (
        <p className="rounded-lg border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-sm">
          <span className="font-medium">What would make it better: </span>
          {verdict.review.changeNeeded}
        </p>
      )}

      {!verdict && runStatus === "succeeded" && (
        <p className="text-sm text-muted-foreground">This run has not been checked yet.</p>
      )}
    </div>
  );
}
