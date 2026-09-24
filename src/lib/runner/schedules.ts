import "server-only";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { automations, organization } from "@/db/schema";
import { AutomationTemplate } from "@/contracts/automation";
import type { TickSchedules } from "@/contracts/runner";
import { fillTemplate } from "@/lib/automations/template";
import { startRun } from "@/lib/runs/start";
import { scheduleAction } from "./next-run";

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Start the run of every active automation whose schedule is due, and move each next_run_at on. Called every 30 s
 * by the worker and by Vercel cron (/api/cron/tick); both may run at once, so a slot is taken with a conditional
 * update before its run starts. One automation failing (a bad template, the budget spent) never stops the others.
 */
/**
 * The active schedules that are due, of workspaces that still exist: automations have no foreign key to their
 * workspace, and one whose workspace is gone must never start paid runs nobody can see or stop (security review S4).
 */
export async function dueAutomations(now: Date) {
  const rows = await db
    .select({ automation: automations })
    .from(automations)
    .innerJoin(organization, eq(organization.id, automations.workspaceId))
    .where(
      and(
        eq(automations.status, "active"),
        isNotNull(automations.schedule),
        or(isNull(automations.nextRunAt), lte(automations.nextRunAt, now)), // null: just scheduled, compute its first slot
      ),
    );
  return rows.map((r) => r.automation);
}

export const tickSchedules: TickSchedules = async (now) => {
  const candidates = await dueAutomations(now);

  const started: string[] = [];
  for (const a of candidates) {
    try {
      // read in the zone it was set in (schedule_tz), so 08:00 stays 08:00 across daylight saving; null is UTC
      const action = scheduleAction({ schedule: a.schedule ?? "", nextRunAt: a.nextRunAt, tz: a.scheduleTz }, now);
      if (!action.next) {
        console.warn(`automation ${a.id}: schedule "${a.schedule}" in zone ${a.scheduleTz ?? "UTC"} cannot be read; not fired`);
        continue;
      }
      // Move next_run_at first, and only while it is still what this tick saw (due, or unset): if another tick moved it
      // already, this matches nothing and does not fire. A start that then fails (budget spent) waits for the next
      // slot, not the next tick.
      const moved = await db
        .update(automations)
        .set({ nextRunAt: action.next })
        .where(and(eq(automations.id, a.id), a.nextRunAt ? lte(automations.nextRunAt, now) : isNull(automations.nextRunAt)))
        .returning({ id: automations.id });
      if (!action.fire || !moved.length) continue;

      const template = AutomationTemplate.parse(a.template); // jsonb is only typed at compile time
      const input = a.scheduleInput ?? "";
      const { prompt } = fillTemplate({ name: a.name, inputLabel: a.inputLabel, template }, input);
      const { id } = await startRun(
        { workspaceId: a.workspaceId, userId: null }, // nobody pressed Run: the schedule did
        { prompt, purpose: "schedule", automationId: a.id, automationVersion: a.version, input },
      );
      started.push(id);
    } catch (err) {
      console.error(`schedule of automation ${a.id} (${a.name}) did not start: ${reason(err)}`);
    }
  }
  return started;
};
