import "server-only";
import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { automations } from "@/db/schema";
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
export const tickSchedules: TickSchedules = async (now) => {
  const candidates = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.status, "active"),
        isNotNull(automations.schedule),
        or(isNull(automations.nextRunAt), lte(automations.nextRunAt, now)), // null: just scheduled, compute its first slot
      ),
    );

  const started: string[] = [];
  for (const a of candidates) {
    try {
      const action = scheduleAction({ schedule: a.schedule ?? "", nextRunAt: a.nextRunAt }, now);
      if (!action.next) {
        console.warn(`automation ${a.id}: schedule "${a.schedule}" is not a valid cron expression; not fired`);
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
