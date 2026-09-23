"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { outcome } from "./outcome";
import { groupByDay, matchesSearch } from "./rail";
import { StatusDot } from "./status-dot";

// What the server hands the rail for each run: only what a row shows and what the search reads.
export type RailRun = {
  id: string;
  prompt: string;
  title: string;
  tag: string | null;
  status: string;
  outcome: string | null;
  stopping: boolean;
  createdAt: string;
};

const noSubscribe = () => () => {};

// The runs, grouped by the reader's day, with a search over the instructions. The open run is a search param, so a
// refresh or a shared link keeps it open; the search is client state, because it only filters what is on screen.
export function RunsRail({ runs, selectedId, onPick }: { runs: RailRun[]; selectedId?: string; onPick?: () => void }) {
  const [query, setQuery] = useState("");
  // "Today" is the reader's today: the server groups in UTC, the browser in its own zone, without a hydration error
  const timeZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const groups = groupByDay(runs.filter((r) => matchesSearch(r, query)), new Date(), timeZone);

  return (
    // a landmark: the rail is how the app is navigated, so a screen reader can jump straight to it (Q73)
    <nav aria-label="Runs" className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pt-3 pb-2">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 mt-0.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search runs"
          placeholder="Search runs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8 text-sm"
        />
      </div>

      <div data-testid="runs" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {runs.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No runs yet - describe a task and press Run.</p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">No runs match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mt-3 first:mt-1">
              <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</h3>
              <ul className="space-y-0.5">
                {group.runs.map((run) => (
                  <li key={run.id}>
                    <RailRow run={run} selected={run.id === selectedId} onPick={onPick} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </nav>
  );
}

function RailRow({ run, selected, onPick }: { run: RailRun; selected: boolean; onPick?: () => void }) {
  // the same function the run's header calls: the rail and the run can never disagree about how it went
  const result = outcome(run.status, run.outcome, run.stopping);
  return (
    <Link
      href={`/?run=${run.id}`}
      onClick={onPick}
      aria-current={selected ? "true" : undefined}
      title={run.prompt} // the row truncates the instructions; the tooltip is the rest of them (Q74)
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/70 max-[899px]:min-h-10",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", // the one focus ring (Q71)
        selected ? "bg-muted font-medium" : "text-foreground/85",
      )}
    >
      <StatusDot tone={result.tone} />
      <span className="min-w-0 flex-1 truncate">{run.title}</span>
      {run.tag && <span className="shrink-0 text-[11px] text-muted-foreground">{run.tag}</span>}
      {/* the dot is colour only: its meaning is spelled out for a screen reader */}
      <span className="sr-only">, {result.label}</span>
    </Link>
  );
}
