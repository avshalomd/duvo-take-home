import { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput } from "@/contracts/eval";
import { RunEvent, RunPurpose, type Run } from "@/contracts/run";
import type { automations, files, runEvents, runs } from "@/db/schema";
import { spreadsheetsIn, whatItRead } from "./from-events";

// A run's database rows as the evaluator reads them. Pure and free of `@/db` (server-only), so Re-evaluate
// (reevaluate.ts), the offline suite (suite-case.ts) and the script that records a run into it
// (scripts/record-run.ts) share one mapping.

/** The run as the evaluator's input. Pure, so what the judge is shown can be tested without a database. */
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
    followUp: Boolean(run.parentRunId), // as the live run was judged: its conversation holds what the parent read
    spreadsheets: spreadsheetsIn(events),
    read: whatItRead(events),
  };
}

export function toRun(row: typeof runs.$inferSelect): Run {
  return {
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
    workspaceId: row.workspaceId,
    purpose: RunPurpose.catch("adhoc").parse(row.purpose), // the column is free text; an unknown value reads as adhoc
    automationId: row.automationId,
    automationVersion: row.automationVersion,
    input: row.input,
    parentRunId: row.parentRunId,
  };
}

export function toEvents(rows: (typeof runEvents.$inferSelect)[]): RunEvent[] {
  return rows
    .map((e) => RunEvent.safeParse({ seq: e.seq, at: e.at.toISOString(), kind: e.kind, payload: e.payload }))
    .flatMap((r) => (r.success ? [r.data] : [])); // a row written by an older shape is skipped, not a 500
}

/**
 * Every file as stored, a spreadsheet as its base64: the checks read its zip signature from it (Q124), and the judge
 * and the reviewer are shown only its size (file-view.ts), so the models never see the base64.
 */
export function toFiles(rows: (typeof files.$inferSelect)[]): { name: string; content: string }[] {
  return rows.map((f) => ({ name: f.name, content: f.content }));
}

/**
 * The template the run was held to when it ran, so a re-evaluation checks the same promises. Only while the
 * automation still has the run's version: an edit since then changed the promises, and holding an old run to new
 * steps would fail it for something it was never asked to do.
 */
export function templateOf(run: typeof runs.$inferSelect, automation: Pick<typeof automations.$inferSelect, "template" | "version"> | undefined): AutomationTemplate | null {
  if (!automation) return null;
  if (run.automationVersion !== null && run.automationVersion !== automation.version) return null;
  const parsed = AutomationTemplate.safeParse(automation.template);
  return parsed.success ? parsed.data : null; // a template stored in an older shape is no reason to fail Re-evaluate
}
