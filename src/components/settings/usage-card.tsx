import type { Usage, WorkspaceLimits } from "@/contracts/usage";
import { cn } from "@/lib/utils";
import { meterFill, resetsIn, usd } from "./usage-format";

// Today at a glance: how much of the day's runs and money is used, what is working now, and when it starts over.
export function UsageCard({ usage, limits, now }: { usage: Usage; limits: WorkspaceLimits; now: Date }) {
  return (
    <section data-testid="usage" className="space-y-4 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Today</h2>
        <p className="text-xs text-muted-foreground">Starts over at midnight UTC, {resetsIn(usage.resetsAt, now)}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Meter label="Runs today" used={usage.runsToday} limit={limits.dailyRunLimit} text={`${usage.runsToday} of ${limits.dailyRunLimit}`} />
        <Meter
          label="Spent today"
          used={usage.costTodayUsd}
          limit={limits.dailyBudgetUsd}
          text={`${usd(usage.costTodayUsd)} of ${usd(limits.dailyBudgetUsd)}`}
        />
        <Meter
          label="Working now"
          used={usage.inFlight}
          limit={limits.maxInFlight}
          text={`${usage.inFlight} of ${limits.maxInFlight} at the same time`}
        />
      </div>
    </section>
  );
}

const fillClass = { ok: "bg-emerald-600", warn: "bg-amber-500", full: "bg-red-500" };

function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const { percent, tone } = meterFill(used, limit);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{text}</span>
      </div>
      <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-valuetext={text} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width]", fillClass[tone])} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
