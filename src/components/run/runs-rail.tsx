"use client";

import { Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
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
  command: string | null; // the command of the run's automation, for the search: an example is tagged "example" (Q133)
  status: string;
  outcome: string | null;
  stopping: boolean;
  healAttempts: number; // auto-heal's fixes so far: a run fixing its result still reads as work in progress
  createdAt: string;
};

const noSubscribe = () => () => {};

// The runs, grouped by the reader's day, with a search over the instructions, titles and commands. Rows are text on
// the rail's material; the open run is a paper chip. The open run is a search param, so a refresh or a shared link
// keeps it open; the search is client state, because it only filters what is on screen.
export function RunsRail({ runs, selectedId, onPick }: { runs: RailRun[]; selectedId?: string; onPick?: () => void }) {
  const [query, setQuery] = useState("");
  // "Today" is the reader's today: the server groups in UTC, the browser in its own zone, without a hydration error
  const timeZone = useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
  const groups = groupByDay(runs.filter((r) => matchesSearch(r, query)), new Date(), timeZone);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pt-3">
        <Link
          href="/"
          onClick={onPick}
          className="flex h-9 items-center gap-2 rounded-full px-3 text-[14px] font-medium transition-[background-color,transform] duration-100 hover:bg-paper/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:scale-[0.97]"
        >
          <SquarePen aria-hidden className="size-4 text-slate" />
          New run
        </Link>
      </div>
      {/* a landmark: the rail is how the app is navigated, so a screen reader can jump straight to it (Q73) */}
      <nav aria-label="Runs" className="flex min-h-0 flex-1 flex-col">
        <div className="relative px-3 pt-1 pb-2">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-6 size-3.5 -translate-y-1/2 text-slate" />
          <input
            type="search"
            aria-label="Search runs"
            placeholder="Search runs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded-full bg-paper/60 pr-3 pl-8 text-[14px] outline-none placeholder:text-slate focus-visible:bg-paper focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <div data-testid="runs" className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          {runs.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-slate">No runs yet. Your first brief will appear here.</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-slate">No runs match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mt-4 first:mt-1">
                <h3 className="px-3 pb-1 text-[12px] font-medium tracking-[0.01em] text-slate">{group.label}</h3>
                <ul>
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
    </div>
  );
}

function RailRow({ run, selected, onPick }: { run: RailRun; selected: boolean; onPick?: () => void }) {
  // the same function the run's outcome line calls: the rail and the run can never disagree about how it went
  const result = outcome(run.status, run.outcome, run.stopping, { attempts: run.healAttempts });
  return (
    <Link
      href={`/?run=${run.id}`}
      onClick={onPick}
      aria-current={selected ? "true" : undefined}
      // the dot's meaning in words, then the instructions the row truncates (Q74, Q105). In the tooltip, not in the
      // row: shown in the row on hover, the words squeezed the title to two letters (Q140)
      title={`${result.label}\n${run.prompt}`}
      className={cn(
        "flex items-center gap-2.5 rounded-full px-3 py-1.5 text-[14px] transition-[background-color,transform] duration-100 active:scale-[0.97] max-[899px]:min-h-10",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none", // the one focus ring (Q71)
        selected ? "bg-paper font-medium shadow-tile" : "text-graphite/85 hover:bg-paper/50",
      )}
    >
      <StatusDot tone={result.tone} />
      <span data-testid="rail-title" className="min-w-0 flex-1 truncate">
        {run.title}
      </span>
      {run.tag && (
        <span aria-hidden className="shrink-0 text-[12px] text-slate">
          {run.tag}
        </span>
      )}
      <span className="sr-only">, {result.label}</span>
    </Link>
  );
}
