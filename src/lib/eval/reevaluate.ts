import { asc, eq } from "drizzle-orm";
import type { EvaluateInput, ReevaluateRun, Verdict } from "@/contracts/eval";
import { RunEvent, type Run } from "@/contracts/run";
import { db, schema } from "@/db";
import { evaluateRun } from "./evaluate";

// Re-evaluating a stored run: the same evaluator, fed from the database instead of from a live run. It exists
// because a verdict can come back "unknown" when Jev's routes are down - the user presses Re-evaluate and the
// judgment is made again, with no agent run and no cost beyond one model call.

export type LoadedRun = { run: Run; events: RunEvent[]; files: { name: string; content: string }[] };
export type ReevaluateDeps = {
  load: (runId: string) => Promise<LoadedRun | null>;
  evaluate: (input: EvaluateInput) => Promise<Verdict>;
  save: (runId: string, verdict: Verdict) => Promise<void>;
};

export const reevaluateRun: ReevaluateRun = async (runId) => reevaluate(runId, { load: loadRun, evaluate: evaluateRun, save: saveVerdict });

export async function reevaluate(runId: string, deps: ReevaluateDeps): Promise<Verdict> {
  const loaded = await deps.load(runId);
  if (!loaded) throw new Error(`No run ${runId} to evaluate.`); // names the run: the caller is a route handler
  const verdict = await deps.evaluate(toEvaluateInput(loaded.run, loaded.events, loaded.files));
  await deps.save(runId, verdict);
  return verdict;
}

/** The run's rows as the evaluator's input. Pure, so what the judge is shown can be tested without a database. */
export function toEvaluateInput(run: Run, events: RunEvent[], files: { name: string; content: string }[]): EvaluateInput {
  const plans = events.filter((e) => e.kind === "plan");
  const toolNames = events.filter((e) => e.kind === "tool_call").map((e) => e.payload.name);
  return {
    prompt: run.prompt,
    runStatus: run.status,
    report: run.report ?? run.error,
    plan: plans.length ? plans[plans.length - 1].payload : null, // the last plan event is the plan as it ended
    files,
    // The run's own day, not today's: re-evaluating next week must not turn "the last 7 days" into a failure.
    today: (run.finishedAt ?? run.createdAt).slice(0, 10),
    toolsUsed: [...new Set(toolNames)],
  };
}

export async function loadRun(runId: string): Promise<LoadedRun | null> {
  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  if (!row) return null;
  const eventRows = await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId)).orderBy(asc(schema.runEvents.seq));
  const fileRows = await db.select().from(schema.files).where(eq(schema.files.runId, runId));
  const events = eventRows
    .map((e) => RunEvent.safeParse({ seq: e.seq, at: e.at.toISOString(), kind: e.kind, payload: e.payload }))
    .flatMap((r) => (r.success ? [r.data] : [])); // a row written by an older shape is skipped, not a 500
  return {
    run: {
      id: row.id,
      prompt: row.prompt,
      status: row.status as Run["status"],
      model: row.model,
      connectionIds: row.connectionIds,
      report: row.report,
      error: row.error,
      numTurns: row.numTurns,
      durationMs: row.durationMs,
      costUsd: row.costUsd,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    },
    events,
    files: fileRows.map((f) => ({ name: f.name, content: f.content })),
  };
}

export async function saveVerdict(runId: string, verdict: Verdict): Promise<void> {
  await db.update(schema.runs).set({ verdict }).where(eq(schema.runs.id, runId));
}
