import Link from "next/link";
import type { Run } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { formatDuration } from "./format";
import { StatusBadge } from "./status-badge";

// The run to show is a search param, not component state, so a refresh or a shared link keeps the same run open.
export function RunsList({ runs, selectedId }: { runs: Run[]; selectedId?: string }) {
  if (runs.length === 0) {
    return <p className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">No runs yet - write instructions above and press Run.</p>;
  }
  return (
    <ul data-testid="runs" className="divide-y rounded-lg border bg-background">
      {runs.map((run) => (
        <li key={run.id}>
          <Link
            href={`/?run=${run.id}`}
            className={cn("block px-3 py-2 hover:bg-muted/60", run.id === selectedId && "bg-muted")}
          >
            <div className="flex items-center gap-2">
              <StatusBadge status={run.status} className="text-[10px]" />
              <span className="ml-auto text-xs text-muted-foreground">{formatDuration(run.durationMs)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm">{run.prompt}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
