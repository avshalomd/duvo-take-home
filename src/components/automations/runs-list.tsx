import Link from "next/link";
import type { Run } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { formatCost, formatDuration } from "./format";
import { outcome } from "./outcome";
import { StatusDot } from "./status-dot";
import { TimeAgo } from "./time-ago";

// The run to show is a search param, not component state, so a refresh or a shared link keeps the same run open.
export function RunsList({ runs, selectedId }: { runs: Run[]; selectedId?: string }) {
  return (
    // a landmark, because this list is how the app is navigated: a screen reader can jump straight to it (Q73)
    <nav aria-label="Past runs" className="rounded-xl border bg-background">
      <h2 className="border-b px-3 py-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Runs
      </h2>
      {runs.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          No runs yet - write a task above and press Run.
        </p>
      ) : (
        <ul data-testid="runs" className="divide-y">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                href={`/?run=${run.id}`}
                aria-current={run.id === selectedId ? "true" : undefined}
                title={run.prompt} // the row truncates the instruction; the tooltip is the rest of it (Q74)
                className={cn(
                  "block px-3 py-2 transition-colors hover:bg-muted/60",
                  // the same ring the buttons use, instead of the browser's default outline (Q71)
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  run.id === selectedId && "bg-muted",
                  // a running row breathes, so the list shows which run is moving without reading it
                  run.status === "running" && "animate-pulse",
                )}
              >
                <div className="flex items-center gap-2">
                  {/* the same function the panel calls, on Run.outcome: the list and the run can never disagree */}
                  <StatusDot tone={outcome(run.status, run.outcome ?? null).tone} />
                  <span data-testid="row-outcome" className="truncate text-xs font-medium">
                    {outcome(run.status, run.outcome ?? null).label}
                  </span>
                  <TimeAgo iso={run.createdAt} className="ml-auto shrink-0 text-[11px] text-muted-foreground" />
                </div>
                <p className="mt-1 truncate text-sm">{run.prompt}</p>
                {run.finishedAt && (
                  // "42 s, $0.164 spent" rather than "42 s - $0.164": the dash left the numbers unexplained (Q74)
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {formatDuration(run.durationMs)}, {formatCost(run.costUsd)} spent
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
