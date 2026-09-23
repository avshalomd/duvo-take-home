import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs } from "@/db/schema";
import type { CancelRun } from "@/contracts/runner";
import { closeAbandonedRuns } from "@/lib/runner/recover";
import { IN_FLIGHT } from "@/lib/runner/status";
import { cancelDecision, STOPPED_BY_YOU } from "./cancel-rule";

/** A refusal the caller shows as it is: 404 for a run that is not the caller's, 409 for one that cannot stop. */
export class CancelError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409,
  ) {
    super(message);
  }
}

const NOT_FOUND = "This run was not found";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); // Postgres throws on a bad uuid

/**
 * Stop a run of this workspace. A queued run is closed here and now, because no loop is watching it yet; a running
 * or evaluating one gets cancel_requested_at, which its loop reads every 2 s before it aborts the agent and closes
 * the run as cancelled with the files written so far. One whose loop is gone (past every runner's limit) is closed
 * as cancelled here.
 */
export const cancelRun: CancelRun = async (workspaceId, runId) => {
  if (!isUuid(runId)) throw new CancelError(NOT_FOUND, 404);
  const [run] = await db.select({ status: runs.status }).from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)));
  if (!run) throw new CancelError(NOT_FOUND, 404); // another workspace's run reads as not found: its existence does not leak

  const decision = cancelDecision(run.status);
  if (!decision.ok) throw new CancelError(decision.reason, 409);

  const now = new Date();
  if (decision.closeNow) {
    // Only while it is still queued: if a loop picked it up since the read above, this matches nothing and the
    // request below reaches that loop instead.
    const closed = await db
      .update(runs)
      .set({ status: "cancelled", error: STOPPED_BY_YOU, cancelRequestedAt: now, finishedAt: now })
      .where(and(eq(runs.id, runId), eq(runs.status, "queued")))
      .returning({ id: runs.id });
    if (closed.length) {
      await db.update(jobs).set({ status: "done" }).where(and(eq(jobs.runId, runId), eq(jobs.status, "queued"))); // off the queue
      return;
    }
  }

  await db
    .update(runs)
    .set({ cancelRequestedAt: now })
    .where(and(eq(runs.id, runId), inArray(runs.status, [...IN_FLIGHT]), isNull(runs.cancelRequestedAt))); // the first press counts
  // A run whose function was ended has no loop left to read that request: once it is past every runner's limit, the
  // sweep closes it here, as stopped (the request above is how it ended).
  await closeAbandonedRuns(now, workspaceId);
};
