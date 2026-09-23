import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { outcomeOf } from "./outcome";

// The reads over runs that only the automations pages need. Every one filters on the session's workspace.

export type AutomationRun = {
  id: string;
  status: string;
  outcome: ReturnType<typeof outcomeOf>;
  input: string | null;
  purpose: string;
  createdAt: string;
};

const fields = {
  id: runs.id,
  status: runs.status,
  verdict: runs.verdict,
  input: runs.input,
  purpose: runs.purpose,
  createdAt: runs.createdAt,
  automationId: runs.automationId,
};
type Picked = { id: string; status: string; verdict: unknown; input: string | null; purpose: string; createdAt: Date };
const toRun = (r: Picked): AutomationRun => ({
  id: r.id,
  status: r.status,
  outcome: outcomeOf(r.verdict),
  input: r.input,
  purpose: r.purpose,
  createdAt: r.createdAt.toISOString(),
});

/** Each automation's most recent run (an example or a real call), for the "last run" line on its card. */
export async function lastRunPerAutomation(workspaceId: string): Promise<Map<string, AutomationRun>> {
  const rows = await db
    .selectDistinctOn([runs.automationId], fields) // Postgres DISTINCT ON: the first row per automation in the order below
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), isNotNull(runs.automationId)))
    .orderBy(runs.automationId, desc(runs.createdAt));
  return new Map(rows.map((r) => [r.automationId as string, toRun(r)]));
}

/** An automation's real runs - called by its command, Run now or its schedule - newest first. Examples are not history. */
export async function automationHistory(workspaceId: string, automationId: string): Promise<AutomationRun[]> {
  const rows = await db
    .select(fields)
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), eq(runs.automationId, automationId), inArray(runs.purpose, ["automation", "schedule"])))
    .orderBy(desc(runs.createdAt))
    .limit(20);
  return rows.map(toRun);
}

export type StartingRun = { id: string; prompt: string; createdAt: string; outcome: ReturnType<typeof outcomeOf> };

/**
 * The runs an automation can be made from: ones that finished, typed by a person (not already an automation's run,
 * whose prompt is a filled template), newest first.
 */
export async function runsToStartFrom(workspaceId: string): Promise<StartingRun[]> {
  const rows = await db
    .select({ id: runs.id, prompt: runs.prompt, createdAt: runs.createdAt, verdict: runs.verdict })
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), eq(runs.status, "succeeded"), inArray(runs.purpose, ["adhoc", "followup"])))
    .orderBy(desc(runs.createdAt))
    .limit(12);
  return rows.map((r) => ({ id: r.id, prompt: r.prompt, createdAt: r.createdAt.toISOString(), outcome: outcomeOf(r.verdict) }));
}
