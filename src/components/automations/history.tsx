import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { TimeAgo } from "@/components/run/time-ago";
import type { AutomationRun } from "@/lib/automations/runs";
import { cn } from "@/lib/utils";
import { DOT } from "./dot";
import { SMALL } from "./surfaces";

// The automation's real runs, newest first: what it was run on and how it went. Each opens on Home like any run.
// `callable`: it is on. One that is off has no Run above and does not answer on Home, so its empty state offers neither.
export function History({ runs, callable }: { runs: AutomationRun[]; callable: boolean }) {
  if (runs.length === 0) return <p className="text-slate">{callable ? "No runs yet. Run it above, or call it from Home." : "No runs yet."}</p>;
  return (
    <ul className="-mx-2">
      {runs.map((r) => {
        const o = outcome(r.status, r.outcome);
        return (
          <li key={r.id}>
            <Link href={`/?run=${r.id}`} className="flex items-center gap-3 rounded-[12px] px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/70">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[o.tone])} />
              <span className="min-w-0 flex-1 truncate text-[15px] text-graphite">{r.input || "No input"}</span>
              <span className={cn(SMALL, "hidden sm:inline")}>
                {o.label}
                {r.purpose === "schedule" ? ", on its schedule" : ""}
              </span>
              <TimeAgo iso={r.createdAt} className={cn(SMALL, "w-24 shrink-0 text-right")} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
