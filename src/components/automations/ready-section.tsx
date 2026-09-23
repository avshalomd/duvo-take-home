import type { Automation } from "@/contracts/automation";
import type { AutomationRun } from "@/lib/automations/runs";
import { describeSchedule } from "@/lib/automations/schedule";
import { History } from "./history";
import { RunBox } from "./run-box";
import { ScheduleForm } from "./schedule-form";
import { StatusToggle } from "./status-toggle";

// The schedule is kept in UTC, so its next time is shown in UTC too rather than half converted.
const utc = (iso: string) =>
  `${new Date(iso).toLocaleString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} UTC`;

// An approved automation's page starts with how to use it: the command to type on Home, a Run box, its schedule,
// the switch, and what it has done so far.
export function ReadySection({ automation: a, history }: { automation: Automation; history: AutomationRun[] }) {
  const active = a.status === "active";
  const example = a.inputExample || a.inputHint || a.inputLabel;
  return (
    <section aria-labelledby="use-it" className="space-y-5 rounded-xl border bg-background p-5">
      <div className="space-y-1">
        <h2 id="use-it" className="text-base font-medium">
          {active ? "Ready to use" : "Turned off"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {active ? (
            <>
              Call it from Home with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                \{a.command} {example}
              </code>
              , or run it here.
            </>
          ) : (
            "Its command and its schedule do nothing until you turn it back on."
          )}
        </p>
      </div>

      {active && <RunBox automationId={a.id} inputLabel={a.inputLabel} placeholder={a.inputHint} />}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Schedule</h3>
        {a.schedule && (
          <p className="text-sm text-muted-foreground">
            {describeSchedule(a.schedule)} with &quot;{a.scheduleInput}&quot;.
            {active && a.nextRunAt && (
              <>
                {" "}
                Next run: {utc(a.nextRunAt)}.
              </>
            )}
          </p>
        )}
        <ScheduleForm key={a.updatedAt} automationId={a.id} inputLabel={a.inputLabel} schedule={a.schedule} scheduleInput={a.scheduleInput} />
      </div>

      <StatusToggle automationId={a.id} active={active} />

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Its runs</h3>
        <History runs={history} />
      </div>
    </section>
  );
}
