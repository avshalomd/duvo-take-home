import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { TimeAgo } from "@/components/run/time-ago";
import { threadTone } from "@/components/thread/thread";
import type { AutomationRun } from "@/lib/automations/runs";
import { cn } from "@/lib/utils";
import { SMALL } from "./surfaces";

const GLYPH = { live: "bg-saffron", done: "bg-fern", failed: "bg-crimson", stopped: "bg-slate" } as const;

// The automation's real runs, newest first: what it was run on and how it went. Each opens on Home like any run.
export function History({ runs }: { runs: AutomationRun[] }) {
  if (runs.length === 0) return <p className="text-slate">No runs yet. Run it above, or call it from Home.</p>;
  return (
    <ul className="-mx-2">
      {runs.map((r) => {
        const o = outcome(r.status, r.outcome);
        return (
          <li key={r.id}>
            <Link href={`/?run=${r.id}`} className="flex items-center gap-3 rounded-[12px] px-2 py-2.5 outline-none hover:bg-muted/60 focus-visible:bg-muted/70">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", GLYPH[threadTone(r.status, r.outcome)])} />
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
