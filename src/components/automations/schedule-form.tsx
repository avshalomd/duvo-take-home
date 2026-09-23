"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useState, useSyncExternalStore } from "react";
import { setScheduleAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cronToChoice, describeChoice, zoneName } from "@/lib/automations/schedule-local";
import { cn } from "@/lib/utils";
import { FIELD, SMALL } from "./surfaces";

type Props = {
  automationId: string;
  inputLabel: string;
  inputExample: string;
  schedule: string | null;
  scheduleInput: string | null;
  scheduleTz: string | null; // the zone the cron is read in; a schedule from before zones were stored reads in UTC
  nextRunAt: string | null;
};

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The schedule in the viewer's own time and zone (Q107). Only the browser knows its zone, so the form appears once
// the page is in the browser (the server snapshot is null) - never a server-side guess.
export function ScheduleForm(props: Props) {
  const zone = useSyncExternalStore(noSubscribe, browserZone, () => null);
  if (zone === null) return <p className={SMALL}>Loading the schedule...</p>;
  return <ScheduleEditor {...props} zone={zone} />;
}

// Not keyed by anything that changes on a save, so its state - "Schedule saved." - outlives the page's refresh (Q120).
function ScheduleEditor({ automationId, inputLabel, inputExample, schedule, scheduleInput, scheduleTz, nextRunAt, zone }: Props & { zone: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setScheduleAction, {});
  const saved = schedule ? cronToChoice(schedule) : null;
  const savedZone = scheduleTz || "UTC";
  // the zone is named only when it is not the viewer's own: a teammate elsewhere sees whose 08:00 it is
  const inZone = savedZone === zone ? "" : `, ${zoneName(savedZone)}`;
  const [preset, setPreset] = useState<string>(state.values?.preset ?? (schedule ? (saved?.repeat ?? "custom") : "none"));
  const v = state.values;

  return (
    <div className="space-y-4">
      {schedule && (
        <p className="text-[15px] text-graphite">
          {saved ? describeChoice(saved) : `A custom schedule (${schedule})`}
          {inZone}
          {scheduleInput ? `, with "${scheduleInput}"` : ""}.
          {nextRunAt && <span className="text-slate"> Next run: {whenIn(nextRunAt, savedZone)}.</span>}
        </p>
      )}
      {/* keyed by the values a refused save sent back: they become the inputs' defaults (Base UI warns when a default changes) */}
      <form key={JSON.stringify(v ?? null)} action={action} className="space-y-4">
        <input type="hidden" name="id" value={automationId} />
        <input type="hidden" name="tz" value={zone} />
        <div className="grid gap-4 sm:grid-cols-[13rem_8rem]">
          <div className="space-y-1.5">
            <label htmlFor="schedule-preset" className="text-[13px] font-medium tracking-[0.01em] text-slate">
              How often
            </label>
            {/* a native select: it submits with the form and needs no state beyond showing the fields that apply */}
            <select
              id="schedule-preset"
              name="preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className={cn(FIELD, "w-full border border-input outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50")}
            >
              <option value="none">Only when I run it</option>
              <option value="weekdays">Every weekday</option>
              <option value="mondays">Every Monday</option>
              <option value="daily">Every day</option>
              <option value="custom">Custom, as a cron expression</option>
            </select>
          </div>
          {preset !== "none" && preset !== "custom" && (
            <div className="space-y-1.5">
              <label htmlFor="schedule-time" className="text-[13px] font-medium tracking-[0.01em] text-slate">
                At
              </label>
              <Input id="schedule-time" name="time" type="time" defaultValue={v?.time ?? saved?.time ?? "08:00"} className={FIELD} />
            </div>
          )}
        </div>
        {preset === "custom" && (
          <div className="space-y-1.5">
            <label htmlFor="schedule-cron" className="text-[13px] font-medium tracking-[0.01em] text-slate">
              Cron expression, in {zoneName(zone)}
            </label>
            <Input id="schedule-cron" name="cron" placeholder="0 8 * * 1-5" defaultValue={v?.cron ?? (saved ? "" : (schedule ?? ""))} className={FIELD} />
            <p className={SMALL}>Minute, hour, day, month, weekday. At most once an hour.</p>
          </div>
        )}
        {preset !== "none" && (
          <div className="space-y-1.5">
            <label htmlFor="schedule-input" className="text-[13px] font-medium tracking-[0.01em] text-slate">
              {inputLabel} for scheduled runs
            </label>
            <Input id="schedule-input" name="input" defaultValue={v?.input ?? scheduleInput ?? inputExample} className={FIELD} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending} className="h-10 px-5 text-[15px]">
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            Save schedule
          </Button>
          <p aria-live="polite" className={cn("text-[15px]", state.error ? "text-crimson" : "text-fern")}>
            {state.error ?? state.message}
          </p>
        </div>
      </form>
    </div>
  );
}

// The next run in the schedule's own zone and in words: "Monday 28 September at 08:00".
function whenIn(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { timeZone, weekday: "long", day: "numeric", month: "long" });
  const time = d.toLocaleTimeString(undefined, { timeZone, hour: "2-digit", minute: "2-digit" });
  return `${day} at ${time}`;
}
