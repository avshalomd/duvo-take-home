import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker, type ClaimedJob, type WorkerDeps } from "./worker-loop";

/** A promise the test resolves or rejects by hand: a run that is still going until the test says otherwise. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Fake deps over a list of queued jobs; each run waits on its own deferred. */
function setup(queue: ClaimedJob[], overrides: Partial<WorkerDeps> = {}) {
  const runs = new Map<string, ReturnType<typeof deferred>>();
  const log: string[] = [];
  const deps = {
    claim: vi.fn(async () => queue.shift() ?? null),
    run: vi.fn((runId: string) => {
      const d = deferred();
      runs.set(runId, d);
      return d.promise;
    }),
    finish: vi.fn(async () => {}),
    recover: vi.fn(async () => {}),
    tick: vi.fn(async () => {}),
    now: () => new Date("2026-09-23T10:00:00Z"),
    log: (line: string) => void log.push(line),
    ...overrides,
  };
  return { deps, runs, log };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const jobs = (n: number): ClaimedJob[] => Array.from({ length: n }, (_, i) => ({ jobId: `job-${i}`, runId: `run-${i}` }));

afterEach(() => {
  vi.useRealTimers();
});

describe("the worker loop", () => {
  it("claims up to its concurrency and no more while those runs are going", async () => {
    const { deps } = setup(jobs(5));
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    expect(await w.pollOnce()).toBe(2);
    expect(deps.claim).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.run).mock.calls.map((c) => c[0])).toEqual(["run-0", "run-1"]);
    expect(w.inFlight()).toBe(2);
    expect(await w.pollOnce()).toBe(0); // both slots busy: it does not even ask the queue
    expect(deps.claim).toHaveBeenCalledTimes(2);
  });

  it("stops claiming as soon as the queue is empty", async () => {
    const { deps } = setup([]);
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    expect(await w.pollOnce()).toBe(0);
    expect(deps.claim).toHaveBeenCalledTimes(1);
  });

  it("marks a job done when its run returns", async () => {
    const { deps, runs } = setup(jobs(1));
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    await w.pollOnce();
    runs.get("run-0")!.resolve();
    await flush();
    expect(deps.finish).toHaveBeenCalledWith("job-0", "done");
    expect(w.inFlight()).toBe(0);
  });

  it("marks a job failed when its run throws, logs why, and keeps working", async () => {
    const { deps, runs, log } = setup(jobs(2));
    const w = createWorker(deps, { concurrency: 1, pollMs: 1000, tickMs: 30_000 });
    await w.pollOnce();
    runs.get("run-0")!.reject(new Error("run run-0 not found"));
    await flush();
    expect(deps.finish).toHaveBeenCalledWith("job-0", "failed");
    expect(log.join("\n")).toContain("run run-0 not found");
    await flush();
    expect(deps.run).toHaveBeenCalledWith("run-1"); // the freed slot was filled
  });

  it("claims the next job as soon as a slot frees up, without waiting for the next poll", async () => {
    const { deps, runs } = setup(jobs(3));
    const w = createWorker(deps, { concurrency: 1, pollMs: 60_000, tickMs: 60_000 });
    await w.pollOnce();
    runs.get("run-0")!.resolve();
    await flush();
    await flush();
    expect(vi.mocked(deps.run).mock.calls.map((c) => c[0])).toEqual(["run-0", "run-1"]);
  });

  it("logs a claim that throws (the database is down) and carries on", async () => {
    const { deps, log } = setup([], { claim: vi.fn(async () => Promise.reject(new Error("connection refused"))) });
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    expect(await w.pollOnce()).toBe(0);
    expect(log.join("\n")).toContain("connection refused");
  });

  it("logs a finish that throws instead of crashing the process", async () => {
    const { deps, runs, log } = setup(jobs(1), { finish: vi.fn(async () => Promise.reject(new Error("write failed"))) });
    const w = createWorker(deps, { concurrency: 1, pollMs: 1000, tickMs: 30_000 });
    await w.pollOnce();
    runs.get("run-0")!.resolve();
    await flush();
    await flush();
    expect(log.join("\n")).toContain("write failed");
    expect(w.inFlight()).toBe(0);
  });

  it("tickOnce runs the stale-lock recovery and the schedules, and one failing does not skip the other", async () => {
    const { deps, log } = setup([], { recover: vi.fn(async () => Promise.reject(new Error("recovery broke"))) });
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    await w.tickOnce();
    expect(deps.recover).toHaveBeenCalledWith(new Date("2026-09-23T10:00:00Z"));
    expect(deps.tick).toHaveBeenCalledWith(new Date("2026-09-23T10:00:00Z"));
    expect(log.join("\n")).toContain("recovery broke");
  });

  it("start() polls every pollMs and ticks every tickMs", async () => {
    vi.useFakeTimers();
    const { deps } = setup([]);
    const w = createWorker(deps, { concurrency: 2, pollMs: 1000, tickMs: 30_000 });
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.claim).toHaveBeenCalledTimes(1); // once at start
    expect(deps.tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(deps.claim).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(deps.tick).toHaveBeenCalledTimes(2);
    await w.stop();
  });

  it("stop() stops claiming and waits for the runs in flight before it resolves", async () => {
    vi.useFakeTimers();
    const { deps, runs } = setup(jobs(3));
    const w = createWorker(deps, { concurrency: 1, pollMs: 1000, tickMs: 30_000 });
    w.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.inFlight()).toBe(1);

    let stopped = false;
    const stopping = w.stop().then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false); // run-0 is still going
    expect(deps.claim).toHaveBeenCalledTimes(1);

    runs.get("run-0")!.resolve();
    await stopping;
    expect(stopped).toBe(true);
    expect(deps.finish).toHaveBeenCalledWith("job-0", "done");
    expect(deps.claim).toHaveBeenCalledTimes(1); // the freed slot is not refilled once stopping
  });
});
