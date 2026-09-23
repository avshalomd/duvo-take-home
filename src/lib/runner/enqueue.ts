import "server-only";
import { after } from "next/server";
import type { EnqueueRun } from "@/contracts/runner";
import { runAutomation } from "@/lib/agent/run";
import { failStart } from "./fail-start";
import { insertJob } from "./jobs";
import { runnerMode } from "./mode";
import { runnerToken } from "./token";

/**
 * RUNNER=inline (default): the loop runs in after(), inside the request that started it (v1's path, bounded by the
 * function's 300 s). RUNNER=queue: a jobs row that `scripts/worker.ts` claims; no function time limit there.
 * RUNNER=route (Vercel): the run is posted to /api/runner/<id>, which runs it in a function of its own.
 */
export const enqueueRun: EnqueueRun = async (runId) => {
  const mode = runnerMode();
  if (mode === "queue") {
    await insertJob(runId);
    return;
  }
  after(async () => {
    try {
      if (mode === "route") await handToRunner(runId);
      else await runAutomation(runId);
    } catch (err) {
      // after() swallows rejections: log it, the run row itself is closed as failed inside runAutomation.
      console.error(`run ${runId} failed`, err);
    }
  });
};

// The app's own public address (the same one sign-in uses), never the request's: a deployment's own URL can sit
// behind Vercel's login, while the production address answers.
async function handToRunner(runId: string): Promise<void> {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/runner/${runId}`, {
      method: "POST",
      headers: { authorization: `Bearer ${runnerToken(runId)}` },
      signal: AbortSignal.timeout(20_000), // the runner answers 202 at once; a cold start is the wait
    });
    if (res.status !== 202) throw new Error(`the runner answered ${res.status}`);
  } catch (err) {
    console.error(`run ${runId} could not be handed to the runner`, err);
    await failStart(runId);
  }
}
