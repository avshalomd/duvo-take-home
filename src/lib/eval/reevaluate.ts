import { and, asc, eq } from "drizzle-orm";
import type { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput, ReevaluateRun, Verdict } from "@/contracts/eval";
import type { Run, RunEvent } from "@/contracts/run";
import { db, schema } from "@/db";
import { instructionsOf } from "@/lib/agent/follow-up";
import { evaluateRun } from "./evaluate";
import { templateOf, toEvaluateInput, toEvents, toFiles, toRun } from "./run-rows";

export { toEvaluateInput }; // its home is run-rows.ts (pure, shared with the offline suite); callers import it from here

// Re-evaluating a stored run: the same evaluator, fed from the database instead of from a live run. It exists
// because a verdict can come back "unknown" when Jev's routes are down - the user presses Re-evaluate and the
// judgment is made again, with no agent run and no cost beyond one model call.

export type LoadedRun = {
  run: Run;
  events: RunEvent[];
  files: { name: string; content: string }[];
  template?: AutomationTemplate | null; // the saved automation the run followed, while it still has the run's version
};
export type ReevaluateDeps = {
  load: (runId: string) => Promise<LoadedRun | null>;
  evaluate: (input: EvaluateInput) => Promise<Verdict>;
  save: (runId: string, verdict: Verdict) => Promise<void>;
};

export const reevaluateRun: ReevaluateRun = async (runId) => reevaluate(runId, { load: loadRun, evaluate: evaluateRun, save: saveVerdict });

export async function reevaluate(runId: string, deps: ReevaluateDeps): Promise<Verdict> {
  const loaded = await deps.load(runId);
  if (!loaded) throw new Error(`No run ${runId} to evaluate.`); // names the run: the caller is a route handler
  const verdict = await deps.evaluate({ ...toEvaluateInput(loaded.run, loaded.events, loaded.files), template: loaded.template ?? null });
  await deps.save(runId, verdict);
  return verdict;
}

export async function loadRun(runId: string): Promise<LoadedRun | null> {
  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  if (!row) return null;
  const eventRows = await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId)).orderBy(asc(schema.runEvents.seq));
  const fileRows = await db.select().from(schema.files).where(eq(schema.files.runId, runId));
  // The automation is looked up by workspace as well as id: a run can only be held to its own workspace's template.
  const [automation] =
    row.automationId && row.workspaceId
      ? await db
          .select({ template: schema.automations.template, version: schema.automations.version })
          .from(schema.automations)
          .where(and(eq(schema.automations.id, row.automationId), eq(schema.automations.workspaceId, row.workspaceId)))
          .limit(1)
      : [];
  // Q85: judge the brief the live run was judged on. A follow-up's own prompt is only the change ("Add a summary
  // column"); the thread's first instructions plus every change since are rebuilt by the engine's own function, so
  // the two can never disagree. For any other run instructionsOf() returns its prompt as it is.
  const prompt = row.workspaceId ? await instructionsOf(row, row.workspaceId) : row.prompt;
  return { run: { ...toRun(row), prompt }, events: toEvents(eventRows), files: toFiles(fileRows), template: templateOf(row, automation) };
}

export async function saveVerdict(runId: string, verdict: Verdict): Promise<void> {
  await db.update(schema.runs).set({ verdict }).where(eq(schema.runs.id, runId));
}
