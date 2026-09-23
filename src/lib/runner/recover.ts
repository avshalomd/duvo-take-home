import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, notInArray } from "drizzle-orm";
import { db, transaction } from "@/db";
import { files, jobs, runEvents, runs } from "@/db/schema";
import { STOPPED_BY_YOU } from "@/lib/runs/cancel-rule";
import { IN_FLIGHT, isInFlight } from "./status";

export const STALE_LOCK_MS = 10 * 60_000; // a run's wall clock is 4 min and its evaluation about 1: 10 min is a dead worker
export const MAX_ATTEMPTS = 2;
export const ABANDONED_AFTER_MS = 30 * 60_000;

type Recovered = { requeued: string[]; failed: string[]; cancelled: string[]; done: string[] };

/**
 * Jobs whose worker died (locked for over 10 minutes and still "running"). Each one, in its own transaction:
 * - its run already closed: only the job's last write was lost, so the job is marked done;
 * - the user had pressed Stop: the run closes as cancelled;
 * - tried fewer than 2 times: requeued, and its run starts over from a clean slate (events and files deleted,
 *   because the next attempt writes its own trace from seq 1);
 * - tried twice: the job fails and the run closes as failed with the reason, so it never stays "running".
 */
export async function recoverStaleJobs(now: Date): Promise<Recovered> {
  const cutoff = new Date(now.getTime() - STALE_LOCK_MS);
  const stale = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, cutoff)));

  const out: Recovered = { requeued: [], failed: [], cancelled: [], done: [] };
  for (const { id } of stale) {
    const outcome = await transaction(async (tx) => {
      // Read again under a lock: a worker that was only slow may have finished the job since the list above.
      const [job] = await tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, id), eq(jobs.status, "running"), lt(jobs.lockedAt, cutoff)))
        .for("update");
      if (!job) return null;
      const [run] = await tx.select({ status: runs.status, cancelRequestedAt: runs.cancelRequestedAt }).from(runs).where(eq(runs.id, job.runId)).for("update");

      if (!run || !isInFlight(run.status)) {
        await tx.update(jobs).set({ status: "done" }).where(eq(jobs.id, id));
        return "done" as const;
      }
      if (run.cancelRequestedAt) {
        await tx.update(jobs).set({ status: "done" }).where(eq(jobs.id, id));
        await tx.update(runs).set({ status: "cancelled", error: STOPPED_BY_YOU, finishedAt: now }).where(eq(runs.id, job.runId));
        return "cancelled" as const;
      }
      if (job.attempts < MAX_ATTEMPTS) {
        await tx.update(jobs).set({ status: "queued", lockedBy: null, lockedAt: null }).where(eq(jobs.id, id));
        await tx.delete(runEvents).where(eq(runEvents.runId, job.runId));
        await tx.delete(files).where(eq(files.runId, job.runId));
        await tx
          .update(runs)
          .set({ status: "queued", error: null, report: null, verdict: null, numTurns: null, durationMs: null, costUsd: null, sessionId: null, finishedAt: null })
          .where(eq(runs.id, job.runId));
        return "requeued" as const;
      }
      await tx.update(jobs).set({ status: "failed" }).where(eq(jobs.id, id));
      await tx
        .update(runs)
        .set({ status: "failed", error: `The worker stopped while running it, ${job.attempts} times; it was not tried again`, finishedAt: now })
        .where(eq(runs.id, job.runId));
      return "failed" as const;
    });
    if (outcome) out[outcome].push(id);
  }
  return out;
}

/**
 * Runs nobody will ever close: unfinished, older than 30 minutes, and with no job queued or running for them. That
 * is an inline run whose server restarted mid-run (after() died with it); a queued run waiting behind others has a
 * job, and a dead worker's run is recoverStaleJobs' case. Returns the ids it closed.
 */
export async function closeAbandonedRuns(now: Date): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const live = db.select({ runId: jobs.runId }).from(jobs).where(inArray(jobs.status, ["queued", "running"]));
  const abandoned = and(inArray(runs.status, [...IN_FLIGHT]), lt(runs.createdAt, cutoff), notInArray(runs.id, live));

  const stopped = await db
    .update(runs)
    .set({ status: "cancelled", error: STOPPED_BY_YOU, finishedAt: now })
    .where(and(abandoned, isNotNull(runs.cancelRequestedAt))) // the user had pressed Stop: that is how it ended
    .returning({ id: runs.id });
  const failed = await db
    .update(runs)
    .set({ status: "failed", error: "The server stopped while running it", finishedAt: now })
    .where(and(abandoned, isNull(runs.cancelRequestedAt)))
    .returning({ id: runs.id });
  return [...stopped, ...failed].map((r) => r.id);
}
