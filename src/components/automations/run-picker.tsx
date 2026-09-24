import Link from "next/link";
import { TimeAgo } from "@/components/run/time-ago";
import type { StartingRun } from "@/lib/automations/runs";
import { orderForPicker } from "@/lib/automations/picker";
import { cn } from "@/lib/utils";
import { LINK, SHEET, SMALL } from "./surfaces";

// The runs an automation can be made from, the ones that did well first; the others say why they may be a weaker
// start (Q108). Prefetch is off: a row opens the drafting page, and nothing there is worth fetching ahead.
export function RunPicker({ runs }: { runs: StartingRun[] }) {
  if (runs.length === 0)
    return (
      <div className={cn(SHEET, "px-6 py-10 text-center")}>
        <p className="text-[17px] text-graphite">No finished runs yet.</p>
        <p className="mt-2 text-slate">
          Do a run on{" "}
          <Link href="/" className={LINK}>
            Home
          </Link>{" "}
          first, then come back to save it.
        </p>
      </div>
    );

  return (
    <ul className={cn(SHEET, "divide-y divide-hairline overflow-hidden")}>
      {orderForPicker(runs).map((r) => (
        <li key={r.id}>
          <Link
            href={`/automations/new?run=${r.id}`}
            prefetch={false}
            className="flex items-start gap-3 px-5 py-4 outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", r.mark === null ? "bg-fern" : r.outcome === "fail" ? "bg-crimson" : "border-[1.5px] border-slate")} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] leading-6 text-graphite">{r.prompt}</span>
              <span className={cn(SMALL, "mt-1 flex flex-wrap gap-x-3")}>
                {r.mark && <span className={r.outcome === "fail" ? "text-crimson" : undefined}>{r.mark}</span>}
                <TimeAgo iso={r.createdAt} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
