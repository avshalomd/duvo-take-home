import type { Usage, WorkspaceLimits } from "@/contracts/usage";
import { cn } from "@/lib/utils";
import { InsetGroup } from "./grouped";
import { meterFill, resetsIn, usd } from "./usage-format";

// Today at a glance: two meters, runs and money, side by side in one group; under it, in words, what is working now
// and when the day starts over.
export function UsageCard({ usage, limits, now }: { usage: Usage; limits: WorkspaceLimits; now: Date }) {
  const working =
    usage.inFlight === 0
      ? "No runs are working now."
      : `${usage.inFlight} ${usage.inFlight === 1 ? "run is" : "runs are"} working now, of ${limits.maxInFlight} allowed at the same time.`;
  return (
    <InsetGroup title="Today" data-testid="usage" footer={`${working} The day starts over at midnight UTC, ${resetsIn(usage.resetsAt, now)}.`}>
      <li className="grid sm:grid-cols-2">
        <Meter label="Runs" used={usage.runsToday} limit={limits.dailyRunLimit} value={`${usage.runsToday}`} of={`of ${limits.dailyRunLimit}`} />
        <Meter
          label="Money"
          used={usage.costTodayUsd}
          limit={limits.dailyBudgetUsd}
          value={usd(usage.costTodayUsd)}
          of={`of ${usd(limits.dailyBudgetUsd)}`}
          // the second meter sits beside the first on a wide screen and under it on a phone: the hairline follows
          className="border-t border-hairline sm:border-t-0 sm:border-l"
        />
      </li>
    </InsetGroup>
  );
}

const fillClass = { ok: "bg-graphite", warn: "bg-saffron", full: "bg-crimson" };

function Meter({ label, used, limit, value, of, className }: { label: string; used: number; limit: number; value: string; of: string; className?: string }) {
  const { percent, tone } = meterFill(used, limit);
  return (
    <div className={cn("space-y-2.5 px-4 py-4", className)}>
      <p className="text-[13px] tracking-[0.01em] text-slate">{label}</p>
      <p className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-[26px] leading-none font-semibold tracking-[-0.01em]">{value}</span>
        <span className="text-slate">{of}</span>
      </p>
      <div
        role="meter"
        aria-label={`${label} today`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={`${value} ${of}`}
        className="h-1.5 overflow-hidden rounded-full bg-graphite/10"
      >
        {/* scaleX, not width: the bar is drawn by a transform, the one property the design lets move */}
        <div className={cn("h-full origin-left rounded-full", fillClass[tone])} style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
    </div>
  );
}
