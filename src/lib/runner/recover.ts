import "server-only";

export const STALE_LOCK_MS = 10 * 60_000; // a run's wall clock is 4 min and its evaluation about 1: 10 min is a dead worker
export const MAX_ATTEMPTS = 2;
export const ABANDONED_AFTER_MS = 30 * 60_000;

/** Jobs whose worker died: requeued (the run starts over) while attempts < 2, else the run is closed as failed. */
export async function recoverStaleJobs(now: Date): Promise<{ requeued: string[]; failed: string[] }> {
  throw new Error(`not implemented: recoverStaleJobs(${now.toISOString()})`);
}

/** Runs nobody will ever close (the inline server restarted mid-run): unfinished, old, and with no live job. */
export async function closeAbandonedRuns(now: Date): Promise<string[]> {
  throw new Error(`not implemented: closeAbandonedRuns(${now.toISOString()})`);
}
