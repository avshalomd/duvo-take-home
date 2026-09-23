import "server-only";
import { asc, eq, sql } from "drizzle-orm";
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

export async function finishJob(jobId: string, status: "done" | "failed"): Promise<void> {
  await db.update(jobs).set({ status }).where(eq(jobs.id, jobId));
}
