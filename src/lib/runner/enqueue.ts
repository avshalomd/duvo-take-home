import "server-only";
import { after } from "next/server";
import type { EnqueueRun } from "@/contracts/runner";
import { runAutomation } from "@/lib/agent/run";
import { insertJob } from "./jobs";

/** Read at call time, not at import: the worker sets RUNNER=queue for itself before it starts anything. */
export const runnerMode = (): "inline" | "queue" => (process.env.RUNNER === "queue" ? "queue" : "inline");

/**
 * RUNNER=inline (default): the loop runs in after(), inside the request that started it (v1's path, bounded by the
 * function's 300 s). RUNNER=queue: a jobs row that `scripts/worker.ts` claims; no function time limit there.
 */
export const enqueueRun: EnqueueRun = async (runId) => {
  if (runnerMode() === "queue") {
    await insertJob(runId);
    return;
  }
  after(async () => {
    try {
      await runAutomation(runId);
    } catch (err) {
      // after() swallows rejections: log it, the run row itself is closed as failed inside runAutomation.
      console.error(`run ${runId} failed`, err);
    }
  });
};
