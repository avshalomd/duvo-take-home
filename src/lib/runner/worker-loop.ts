/** A claimed job: the jobs row and the run it executes. */
export type ClaimedJob = { jobId: string; runId: string };

/** Everything the loop touches outside itself, passed in so the loop is tested without a database or a model. */
export type WorkerDeps = {
  claim: () => Promise<ClaimedJob | null>;
  run: (runId: string) => Promise<void>;
  finish: (jobId: string, status: "done" | "failed") => Promise<void>;
  heartbeat?: (jobIds: string[]) => Promise<unknown>; // refreshes the locks of the jobs in flight
  recover: (now: Date) => Promise<unknown>; // stale locks and abandoned runs
  tick: (now: Date) => Promise<unknown>; // schedules that are due
  now?: () => Date;
  log?: (line: string) => void;
};

export type WorkerOptions = { concurrency: number; pollMs: number; tickMs: number; heartbeatMs?: number };

const HEARTBEAT_MS = 60_000; // a minute: far inside the 10 minutes after which a job is taken for dead (recover.ts)

export type Worker = {
  pollOnce: () => Promise<number>; // claims until every slot is busy or the queue is empty; how many it started
  tickOnce: () => Promise<void>; // recovery, then the schedules
  start: () => void;
  stop: () => Promise<void>; // stops claiming and waits for the runs in flight
  inFlight: () => number;
};

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The worker: up to `concurrency` runs at once, each one claimed from the jobs table. It never throws: every failure
 * is logged and the loop carries on, because one bad job or one database blink must not stop the others.
 */
export function createWorker(deps: WorkerDeps, opts: WorkerOptions): Worker {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((line: string) => console.log(line));
  const active = new Set<Promise<void>>();
  const running = new Set<string>(); // the job ids in flight, for the heartbeat
  let stopping = false;
  let polling: Promise<number> | null = null; // one claim loop at a time, or two could fill the same free slot
  let ticking = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let beatTimer: ReturnType<typeof setInterval> | undefined;

  function launch(job: ClaimedJob) {
    running.add(job.jobId);
    const p = (async () => {
      let status: "done" | "failed" = "done";
      try {
        await deps.run(job.runId); // runAutomation closes its own run; a throw here means it could not even start
      } catch (e) {
        status = "failed";
        log(`run ${job.runId} (job ${job.jobId}) threw: ${reason(e)}`);
      }
      running.delete(job.jobId); // no more heartbeats for it: the job is being closed
      await deps.finish(job.jobId, status).catch((e) => log(`could not mark job ${job.jobId} ${status}: ${reason(e)}`));
    })();
    active.add(p);
    void p.finally(() => {
      active.delete(p);
      if (!stopping) void pollOnce(); // a freed slot is filled now, not at the next poll
    });
  }

  async function fill(): Promise<number> {
    let started = 0;
    while (!stopping && active.size < opts.concurrency) {
      let job: ClaimedJob | null;
      try {
        job = await deps.claim();
      } catch (e) {
        log(`claim failed: ${reason(e)}`);
        break;
      }
      if (!job) break; // the queue is empty
      launch(job);
      started++;
    }
    return started;
  }

  function pollOnce(): Promise<number> {
    if (!polling) polling = fill().finally(() => (polling = null));
    return polling;
  }

  async function tickOnce() {
    if (ticking) return; // a slow tick is not overlapped by the next one
    ticking = true;
    const at = now();
    try {
      await deps.recover(at).catch((e) => log(`stale-lock recovery failed: ${reason(e)}`));
      await deps.tick(at).catch((e) => log(`schedule tick failed: ${reason(e)}`));
    } finally {
      ticking = false;
    }
  }

  // Never throws: a missed heartbeat is logged, and the next one a minute later still comes well inside the 10 minutes.
  async function beatOnce() {
    if (!deps.heartbeat || running.size === 0) return;
    await deps.heartbeat([...running]).catch((e) => log(`heartbeat failed: ${reason(e)}`));
  }

  return {
    pollOnce,
    tickOnce,
    start() {
      void tickOnce();
      void pollOnce();
      pollTimer = setInterval(() => void pollOnce(), opts.pollMs);
      tickTimer = setInterval(() => void tickOnce(), opts.tickMs);
      beatTimer = setInterval(() => void beatOnce(), opts.heartbeatMs ?? HEARTBEAT_MS);
    },
    async stop() {
      stopping = true;
      clearInterval(pollTimer);
      clearInterval(tickTimer);
      await polling;
      await Promise.allSettled([...active]); // runs in flight end on their own wall clock, then their jobs are marked
      clearInterval(beatTimer); // only now: the runs still going kept their locks fresh while stop() waited
    },
    inFlight: () => active.size,
  };
}
