"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { setScheduleAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHEDULE_PRESETS } from "@/lib/automations/schedule-presets";

type Props = { automationId: string; inputLabel: string; schedule: string | null; scheduleInput: string | null };

const presetOf = (cron: string | null) => (cron ? (SCHEDULE_PRESETS.find((p) => p.cron === cron)?.id ?? "custom") : "none");

// When it runs by itself. Two presets cover the common case; "custom" takes a cron for anything else. The engine's
// tick starts the runs; this form only stores the schedule, its input and the next time (computed on the server).
export function ScheduleForm({ automationId, inputLabel, schedule, scheduleInput }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setScheduleAction, {});
  const [preset, setPreset] = useState<string>(state.values?.preset ?? presetOf(schedule));

  return (
    // keyed by the values a refused save sent back: they become the inputs' defaults, and Base UI warns when a default changes
    <form key={JSON.stringify(state.values ?? null)} action={action} className="space-y-3">
      <input type="hidden" name="id" value={automationId} />
      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="schedule-preset">When</Label>
          {/* a native select: it submits with the form and needs no state beyond showing the custom field */}
          <select
            id="schedule-preset"
            name="preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="none">Only when I run it</option>
            {SCHEDULE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} (UTC)
              </option>
            ))}
            <option value="custom">Custom (cron)</option>
          </select>
        </div>
        {preset !== "none" && (
          <div className="space-y-1.5">
            <Label htmlFor="schedule-input">{inputLabel} for each scheduled run</Label>
            <Input id="schedule-input" name="input" defaultValue={state.values?.input ?? scheduleInput ?? ""} className="h-8" />
          </div>
        )}
      </div>
      {preset === "custom" && (
        <div className="space-y-1.5">
          <Label htmlFor="schedule-cron">Cron expression (UTC)</Label>
          <Input
            id="schedule-cron"
            name="cron"
            placeholder="0 8 * * 1-5"
            defaultValue={state.values?.cron ?? (presetOf(schedule) === "custom" ? (schedule ?? "") : "")}
            className="h-8 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">minute hour day month weekday. At most once an hour.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          Save schedule
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.error && <span className="text-red-600 dark:text-red-400">{state.error}</span>}
          {state.message && <span className="text-emerald-700 dark:text-emerald-400">{state.message}</span>}
        </p>
      </div>
    </form>
  );
}
