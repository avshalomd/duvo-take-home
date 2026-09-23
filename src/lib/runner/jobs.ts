import "server-only";
import type { ClaimedJob } from "./worker-loop";

/** RUNNER=queue: the web app's half of the queue. The run is already a row; the job says "someone run it". */
export async function insertJob(runId: string): Promise<string> {
  throw new Error(`not implemented: insertJob(${runId})`);
}

/** Take the oldest queued job for this worker, or null when there is none. */
export async function claimJob(workerId: string): Promise<ClaimedJob | null> {
  throw new Error(`not implemented: claimJob(${workerId})`);
}

export async function finishJob(jobId: string, status: "done" | "failed"): Promise<void> {
  throw new Error(`not implemented: finishJob(${jobId}, ${status})`);
}
