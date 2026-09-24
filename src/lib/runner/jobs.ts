import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, transaction } from "@/db";
import { jobs } from "@/db/schema";
import type { ClaimedJob } from "./worker-loop";

/** RUNNER=queue: the web app's half of the queue. The run is already a row; the job says "someone run it". */
export async function insertJob(runId: string): Promise<string> {
  const [row] = await db.insert(jobs).values({ runId }).returning({ id: jobs.id });
  return row.id;
}

/**
 * Take the oldest queued job for this worker, or null when there is none. FOR UPDATE SKIP LOCKED inside a real
 * transaction: a second worker claiming at the same moment skips the locked row and takes the next one instead of
 * waiting for it, so no job is ever run twice and no worker blocks another.
 */
export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  return transaction(async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id, runId: jobs.runId })
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(asc(jobs.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!job) return null;
    await tx
      .update(jobs)
      .set({ status: "running", lockedBy: workerId, lockedAt: new Date(), attempts: sql`${jobs.attempts} + 1` }) // attempts counts claims: the recovery reads it
      .where(eq(jobs.id, job.id));
    return { jobId: job.id, runId: job.runId };
  });
}

/**
 * Mark this worker's job done or failed. Only while this worker holds it: a job taken for dead and claimed again
 * belongs to the next worker, and a late finish from the first must not close it under that one (engine review #15).
 */
export async function finishJob(jobId: string, status: "done" | "failed", workerId: string): Promise<void> {
  await db.update(jobs).set({ status }).where(and(eq(jobs.id, jobId), eq(jobs.lockedBy, workerId)));
}

/**
 * The worker's sign of life: its running jobs' locked_at moves to now, so recoverStaleJobs (10 minutes without a
 * sign) only ever takes the job of a worker that really stopped, not a slow run that is still writing.
 */
export async function heartbeat(workerId: string, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  await db
    .update(jobs)
    .set({ lockedAt: new Date() })
    .where(and(inArray(jobs.id, jobIds), eq(jobs.status, "running"), eq(jobs.lockedBy, workerId)));
}
