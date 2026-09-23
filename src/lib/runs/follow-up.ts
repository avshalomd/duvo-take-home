import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { FollowUpInput, type StartFollowUp } from "@/contracts/agent";
import { isFinished } from "@/lib/runner/status";
import { startRun } from "./start";

/** A refusal the caller shows as it is: a bad change, a parent that is not the caller's, or one still running. */
export class FollowUpError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

/**
 * "Ask for a change" on a finished run. The new run carries only the change as its prompt and points at its parent;
 * the loop restores the parent's files and continues its conversation (runAutomation, lib/agent/follow-up.ts).
 * It goes through startRun like every other start, so the budget and the rate limit cannot be walked around.
 */
export const startFollowUp: StartFollowUp = async (ctx, input) => {
  // Validated here too, the action is not the only caller; the first issue's own words, not Zod's JSON.
  const parsed = FollowUpInput.safeParse(input);
  if (!parsed.success) throw new FollowUpError(parsed.error.issues[0]?.message ?? "Say what should change", 400);
  const { runId, prompt } = parsed.data;
  const [parent] = await db.select({ status: runs.status }).from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, ctx.workspaceId)));
  if (!parent) throw new FollowUpError("This run was not found", 404);
  // A running parent has no final files yet, and its session is still being written: continue it once it is done.
  if (!isFinished(parent.status)) throw new FollowUpError("Wait until this run has finished before asking for a change", 409);

  return startRun(ctx, { prompt, purpose: "followup", parentRunId: runId });
};
