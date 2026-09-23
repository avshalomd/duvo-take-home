import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { StatusDot } from "@/components/run/status-dot";
import { TimeAgo } from "@/components/run/time-ago";
import type { AutomationRun } from "@/lib/automations/runs";

// The automation's real runs, newest first. Each one opens on Home like any other run.
export function History({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet. Run it above, or call it from Home.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {runs.map((r) => {
        const o = outcome(r.status, r.outcome);
        return (
          <li key={r.id}>
            <Link href={`/?run=${r.id}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60">
              <StatusDot tone={o.tone} />
              <span className="min-w-0 flex-1 truncate">{r.input || "(no input)"}</span>
              <span className="text-muted-foreground">
                {o.label}
                {r.purpose === "schedule" ? " - on schedule" : ""}
              </span>
              <TimeAgo iso={r.createdAt} className="w-20 shrink-0 text-right text-xs text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
