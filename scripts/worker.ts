// The queue's worker (RUNNER=queue), a plain Node process outside Next:
//   dotenv -e .env.local -- tsx --conditions=react-server scripts/worker.ts
// --conditions=react-server because `server-only` resolves to an empty module under that condition: @/db and the run
// loop import here exactly as they do in Next. dotenv supplies DATABASE_URL and the model keys before any import.
// It claims jobs (up to WORKER_CONCURRENCY at once, default 2), runs each through the same runAutomation as the web
// app, recovers the jobs of dead workers and fires due schedules every 30 s, and stops cleanly on SIGINT/SIGTERM.
import os from "node:os";
import { runAutomation } from "@/lib/agent/run";
import { claimJob, finishJob } from "@/lib/runner/jobs";
import { closeAbandonedRuns, recoverStaleJobs } from "@/lib/runner/recover";
import { tickSchedules } from "@/lib/runner/schedules";
import { createWorker } from "@/lib/runner/worker-loop";

// A schedule fired here must become a job for this loop, never an after() call: there is no request to run it in.
process.env.RUNNER = "queue";

const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 2);
const workerId = `${os.hostname()}-${process.pid}`; // what jobs.locked_by shows, so a stale lock names its worker
const log = (line: string) => console.log(`${new Date().toISOString()} [worker ${workerId}] ${line}`);

const worker = createWorker(
  {
    claim: () => claimJob(workerId),
    run: async (runId) => {
      log(`run ${runId}: started`);
      await runAutomation(runId);
      log(`run ${runId}: closed`);
    },
    finish: finishJob,
    recover: async (now) => {
      const r = await recoverStaleJobs(now);
      const closed = await closeAbandonedRuns(now);
      if (r.requeued.length) log(`requeued jobs of a dead worker: ${r.requeued.join(", ")}`);
      if (r.failed.length) log(`gave up on jobs tried ${2} times: ${r.failed.join(", ")}`);
      if (r.cancelled.length) log(`closed as stopped: ${r.cancelled.join(", ")}`);
      if (closed.length) log(`closed abandoned runs: ${closed.join(", ")}`);
    },
    tick: async (now) => {
      const started = await tickSchedules(now);
      if (started.length) log(`schedules started runs: ${started.join(", ")}`);
    },
    log,
  },
  { concurrency, pollMs: 2000, tickMs: 30_000 },
);

let signals = 0;
function onSignal(signal: NodeJS.Signals) {
  signals++;
  if (signals > 1) {
    // The runs in flight keep their locks; recoverStaleJobs requeues them after 10 minutes.
    log(`${signal} again: exiting now`);
    process.exit(1);
  }
  log(`${signal}: taking no new jobs, waiting for ${worker.inFlight()} run(s) in flight (${signal} again to exit now)`);
  void worker.stop().then(() => {
    log("stopped cleanly");
    process.exit(0);
  });
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
// One stray rejection (a hook, a late write) must not kill the other runs in flight: log it and carry on.
process.on("unhandledRejection", (e) => log(`unhandled rejection: ${e instanceof Error ? e.stack : String(e)}`));

worker.start();
log(`started: up to ${concurrency} runs at once, polling every 2 s, schedules every 30 s`);
