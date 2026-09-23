/** A claimed job: the jobs row and the run it executes. */
export type ClaimedJob = { jobId: string; runId: string };

/** Everything the loop touches outside itself, passed in so the loop is tested without a database or a model. */
export type WorkerDeps = {
  claim: () => Promise<ClaimedJob | null>;
  run: (runId: string) => Promise<void>;
  finish: (jobId: string, status: "done" | "failed") => Promise<void>;
  recover: (now: Date) => Promise<unknown>; // stale locks and abandoned runs
  tick: (now: Date) => Promise<unknown>; // schedules that are due
  now?: () => Date;
  log?: (line: string) => void;
};

export type WorkerOptions = { concurrency: number; pollMs: number; tickMs: number };

export type Worker = {
  pollOnce: () => Promise<number>; // claims until every slot is busy or the queue is empty; how many it started
  tickOnce: () => Promise<void>; // recovery, then the schedules
  start: () => void;
  stop: () => Promise<void>; // stops claiming and waits for the runs in flight
  inFlight: () => number;
};

export function createWorker(deps: WorkerDeps, opts: WorkerOptions): Worker {
  throw new Error(`not implemented: createWorker(${Object.keys(deps).length}, ${opts.concurrency})`);
}
