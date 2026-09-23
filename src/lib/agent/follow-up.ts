import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { Verdict } from "@/contracts/eval";
import { Plan } from "@/contracts/run";
import { feedbackForAgent } from "@/lib/eval/feedback";
import { carryOverPrompt, followUpInstructions, type ParentRun } from "./follow-up-prompt";
import { restoreFiles } from "./restore-files";
import { resumeOptions } from "./session";
import { readSdkTotals } from "./stopped-cost";

type RunRow = typeof runs.$inferSelect;
// Only the fields the thread is walked by, so the contract's Run (a page's, "Make an automation"'s) and a row both fit.
type ThreadLink = { prompt: string; purpose?: string | null; parentRunId?: string | null };
const MAX_THREAD = 20; // a thread of follow-ups longer than this is cut: the oldest changes are the least relevant

/** The instructions a run answers: its own prompt, or for a follow-up the thread's first prompt and every change since. */
export async function instructionsOf(run: ThreadLink, workspaceId: string): Promise<string> {
  const changes: string[] = [];
  let current: ThreadLink = run;
  for (let hops = 0; current.purpose === "followup" && current.parentRunId && hops < MAX_THREAD; hops++) {
    changes.unshift(current.prompt);
    const [parent] = await db.select().from(runs).where(and(eq(runs.id, current.parentRunId), eq(runs.workspaceId, workspaceId)));
    if (!parent) break;
    current = parent;
  }
  return changes.reduce(followUpInstructions, current.prompt);
}

/** A run's plan as it ended: the last plan event, checked against the contract (jsonb is typed only at compile time). */
async function finalPlan(runId: string): Promise<Plan | null> {
  const [last] = await db
    .select({ payload: runEvents.payload })
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), eq(runEvents.kind, "plan")))
    .orderBy(desc(runEvents.seq))
    .limit(1);
  const parsed = Plan.safeParse(last?.payload);
  return parsed.success ? parsed.data : null;
}

/**
 * Everything a follow-up needs before its agent starts: the parent's files back in the working directory (so the
 * agent edits them rather than starting over), the carry-over prompt with the parent's plan and what the automatic
 * check found (his words: "make sure it has the evaluator outputs and the previous run context"), the instructions
 * it is judged against, and the SDK resume options when the parent's session is still on this machine (session.ts).
 */
export async function prepareFollowUp(run: RunRow, dir: string) {
  const workspaceId = run.workspaceId ?? "";
  if (!run.parentRunId) throw new Error("This run does not continue another one");
  const [parent] = await db.select().from(runs).where(and(eq(runs.id, run.parentRunId), eq(runs.workspaceId, workspaceId)));
  if (!parent) throw new Error("The run this change continues was not found");

  const stored = await db.select().from(files).where(eq(files.runId, parent.id)).orderBy(asc(files.name));
  // A quarantined file holds a credential: it is not handed back to an agent that reads the open web.
  const restored = await restoreFiles(dir, stored.filter((f) => !f.quarantined));

  const parentInstructions = await instructionsOf(parent, workspaceId);
  const verdict = Verdict.safeParse(parent.verdict);
  const context: ParentRun = {
    prompt: parentInstructions,
    report: parent.report,
    files: restored,
    plan: await finalPlan(parent.id),
    verdict: verdict.success ? verdict.data.verdict : null,
    feedback: verdict.success ? feedbackForAgent(verdict.data) : null, // the evaluator's findings, as instructions
  };

  const resume = await resumeOptions(parent.sessionId);
  // A resumed session's SDK total starts from the parent's saved total: that is subtracted, or "Spent today" would
  // count the parent twice (measured on the 2026-09-23 follow-up). A fresh session starts from nothing.
  const costBase = resume ? ((await readSdkTotals(resume.resume, { waitMs: 0 }))?.costUsd ?? 0) : 0;
  return {
    prompt: carryOverPrompt(context, run.prompt),
    instructions: followUpInstructions(parentInstructions, run.prompt),
    resume,
    costBase,
  };
}
