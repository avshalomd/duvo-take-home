// The queue against the real tables. `npm run test:int`. Runs are "[int] ..." in workspace "int-engine-jobs" and
// deleted after. Jobs and runs are dated 2000-01-01 and the recovery is called with a `now` in that year, so the
// oldest-first claim and the time-based recovery only ever touch this file's rows in the shared database.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, jobs, runEvents, runs } from "@/db/schema";
import { enqueueRun } from "./enqueue";
import { claimJob, finishJob, heartbeat } from "./jobs";
import { closeAbandonedRuns, recoverStaleJobs, sweepIfOverdue } from "./recover";

const WS = `int-engine-jobs-${process.pid}`; // per process: other worktrees run these tests against the same database
const Y2K = Date.parse("2000-01-01T00:00:00Z");
const t = (minutes: number) => new Date(Y2K + minutes * 60_000);
const mine = db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, WS));

async function makeRun(what: string, fields: Partial<typeof runs.$inferInsert> = {}) {
  const [row] = await db
    .insert(runs)
    .values({ prompt: `[int] ${what}`, status: "queued", model: "test", workspaceId: WS, createdAt: t(0), ...fields })
    .returning({ id: runs.id });
  return row.id;
}
async function makeJob(runId: string, fields: Partial<typeof jobs.$inferInsert> = {}) {
  const [row] = await db.insert(jobs).values({ runId, createdAt: t(0), ...fields }).returning({ id: jobs.id });
  return row.id;
}
const jobRow = async (id: string) => (await db.select().from(jobs).where(eq(jobs.id, id)))[0];
const runRow = async (id: string) => (await db.select().from(runs).where(eq(runs.id, id)))[0];

async function cleanup() {
  await db.delete(jobs).where(inArray(jobs.runId, mine));
  await db.delete(runEvents).where(inArray(runEvents.runId, mine));
  await db.delete(files).where(inArray(files.runId, mine));
  await db.delete(runs).where(eq(runs.workspaceId, WS));
}

describe.skipIf(!process.env.DATABASE_URL)("the job queue", () => {
  // Each test starts with none of this file's jobs queued, so "the oldest queued job" is always one it made.
  beforeEach(async () => {
    await db.update(jobs).set({ status: "done" }).where(and(inArray(jobs.runId, mine), eq(jobs.status, "queued")));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(cleanup);

  it("claimJob takes the oldest queued job and marks it running, locked by this worker, attempt 1", async () => {
    const older = await makeJob(await makeRun("claim older"), { createdAt: t(1) });
    await makeJob(await makeRun("claim newer"), { createdAt: t(2) });

    const claimed = await claimJob("int-worker-1");
    expect(claimed?.jobId).toBe(older);
    const row = await jobRow(older);
    expect(row.status).toBe("running");
    expect(row.lockedBy).toBe("int-worker-1");
    expect(row.lockedAt).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("claimJob hands back the run id with the job", async () => {
    const runId = await makeRun("claim run id");
    await makeJob(runId, { createdAt: t(1) });
    expect((await claimJob("int-worker-1"))?.runId).toBe(runId);
  });

  it("never gives the same job to two workers claiming at the same moment", async () => {
    const a = await makeJob(await makeRun("race a"), { createdAt: t(1) });
    const b = await makeJob(await makeRun("race b"), { createdAt: t(2) });

    const [one, two] = await Promise.all([claimJob("int-worker-1"), claimJob("int-worker-2")]);
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(one!.jobId).not.toBe(two!.jobId);
    expect([one!.jobId, two!.jobId].sort()).toEqual([a, b].sort());
  });

  it("does not claim a job that is already running", async () => {
    const first = await makeJob(await makeRun("claimed once a"), { createdAt: t(1) });
    const second = await makeJob(await makeRun("claimed once b"), { createdAt: t(2) });
    expect((await claimJob("int-worker-1"))?.jobId).toBe(first);
    expect((await claimJob("int-worker-1"))?.jobId).toBe(second);
  });

  it("finishJob marks a job done or failed", async () => {
    const done = await makeJob(await makeRun("finish done"), { status: "running", lockedBy: "int-worker-1" });
    const failed = await makeJob(await makeRun("finish failed"), { status: "running", lockedBy: "int-worker-1" });
    await finishJob(done, "done", "int-worker-1");
    await finishJob(failed, "failed", "int-worker-1");
    expect((await jobRow(done)).status).toBe("done");
    expect((await jobRow(failed)).status).toBe("failed");
  });

  // Engine review #15: a job taken for dead and claimed again belongs to the second worker; the first one's late
  // finishJob marked the second worker's job done while its run was still going.
  it("finishJob leaves alone a job another worker holds now", async () => {
    const jobId = await makeJob(await makeRun("finish other worker"), { status: "running", lockedBy: "int-worker-2" });
    await finishJob(jobId, "done", "int-worker-1");
    expect((await jobRow(jobId)).status).toBe("running");
  });

  it("heartbeat keeps this worker's running jobs fresh and touches no other worker's", async () => {
    const mine = await makeJob(await makeRun("beat mine"), { status: "running", lockedBy: "int-worker-1", lockedAt: t(1) });
    const theirs = await makeJob(await makeRun("beat theirs"), { status: "running", lockedBy: "int-worker-2", lockedAt: t(1) });
    await heartbeat("int-worker-1", [mine, theirs]);
    expect((await jobRow(mine)).lockedAt!.getTime()).toBeGreaterThan(t(1).getTime());
    expect((await jobRow(theirs)).lockedAt!.getTime()).toBe(t(1).getTime());
  });

  it("enqueueRun with RUNNER=queue inserts a queued job for the run instead of running it here", async () => {
    vi.stubEnv("RUNNER", "queue");
    const runId = await makeRun("enqueue");
    await enqueueRun(runId);
    const rows = await db.select().from(jobs).where(eq(jobs.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("queued");
    expect(rows[0].attempts).toBe(0);
  });
});

describe.skipIf(!process.env.DATABASE_URL)("stale-lock recovery", () => {
  afterAll(cleanup);
  const now = t(20); // every lock below is dated from minute 0 to 15 of 2000-01-01

  it("requeues a job whose worker died after one attempt, and starts its run over from a clean slate", async () => {
    const runId = await makeRun("stale once", { status: "running", error: "half way", sessionId: "s-1" });
    await db.insert(runEvents).values({ runId, seq: 1, kind: "text", payload: { text: "partial" } });
    await db.insert(files).values({ runId, name: "partial.csv", mime: "text/csv", bytes: 1, content: "x" });
    const jobId = await makeJob(runId, { status: "running", lockedBy: "dead-worker", lockedAt: t(5), attempts: 1 });

    const result = await recoverStaleJobs(now);
    expect(result.requeued).toContain(jobId);

    const job = await jobRow(jobId);
    expect(job.status).toBe("queued");
    expect(job.lockedBy).toBeNull();
    expect(job.lockedAt).toBeNull();
    const run = await runRow(runId);
    expect(run.status).toBe("queued");
    expect(run.error).toBeNull();
    expect(run.sessionId).toBeNull();
    expect(await db.select().from(runEvents).where(eq(runEvents.runId, runId))).toHaveLength(0);
    expect(await db.select().from(files).where(eq(files.runId, runId))).toHaveLength(0);
  });

  it("closes the run as failed, with the reason, when its job has already been tried twice", async () => {
    const runId = await makeRun("stale twice", { status: "running" });
    const jobId = await makeJob(runId, { status: "running", lockedBy: "dead-worker", lockedAt: t(5), attempts: 2 });

    const result = await recoverStaleJobs(now);
    expect(result.failed).toContain(jobId);
    expect((await jobRow(jobId)).status).toBe("failed");
    const run = await runRow(runId);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/worker stopped/i);
    expect(run.finishedAt).not.toBeNull();
  });

  it("closes the run as cancelled when the user had pressed Stop before the worker died", async () => {
    const runId = await makeRun("stale cancelled", { status: "running", cancelRequestedAt: t(4) });
    const jobId = await makeJob(runId, { status: "running", lockedBy: "dead-worker", lockedAt: t(5), attempts: 1 });

    await recoverStaleJobs(now);
    expect((await jobRow(jobId)).status).not.toBe("queued");
    const run = await runRow(runId);
    expect(run.status).toBe("cancelled");
    expect(run.error).toBe("Stopped by you");
  });

  it("leaves a job locked five minutes ago alone: its worker may still be on it", async () => {
    const runId = await makeRun("fresh lock", { status: "running" });
    const jobId = await makeJob(runId, { status: "running", lockedBy: "live-worker", lockedAt: t(15), attempts: 1 });

    await recoverStaleJobs(now);
    expect((await jobRow(jobId)).status).toBe("running");
    expect((await runRow(runId)).status).toBe("running");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("abandoned runs", () => {
  afterAll(cleanup);
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const now = t(45);

  // Inline or in the runner route a run lives in one function call, which Vercel ends at 5 minutes: a run still in
  // flight after 6 is dead, and waiting 10 left it "evaluating" in front of the person all that time.
  it("in the runner route, closes a run in flight for over 6 minutes: its function was ended at 5", async () => {
    vi.stubEnv("RUNNER", "route");
    const runId = await makeRun("outlived its function", { status: "evaluating", createdAt: t(38) }); // 7 minutes before now
    expect(await closeAbandonedRuns(now, WS)).toContain(runId);
    expect((await runRow(runId)).status).toBe("failed");
  });

  it("inline, the same 6 minutes: the run lives in the request's function", async () => {
    vi.stubEnv("RUNNER", "");
    const runId = await makeRun("outlived its request", { status: "running", createdAt: t(38) });
    expect(await closeAbandonedRuns(now, WS)).toContain(runId);
  });

  it("with the worker, leaves a run in flight for 7 minutes alone: a worker has no function limit", async () => {
    vi.stubEnv("RUNNER", "queue");
    const runId = await makeRun("a worker's long run", { status: "running", createdAt: t(38) });
    expect(await closeAbandonedRuns(now, WS)).not.toContain(runId);
    expect((await runRow(runId)).status).toBe("running");
  });

  it("closes a run left running for over 10 minutes with no job (the inline server restarted)", async () => {
    const runId = await makeRun("abandoned", { status: "running", createdAt: t(30) }); // 15 minutes before now
    expect(await closeAbandonedRuns(now, WS)).toContain(runId);
    const run = await runRow(runId);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/stopped/i);
    expect(run.finishedAt).not.toBeNull();
  });

  it("leaves an old run alone while its job is still queued: the queue may just be long", async () => {
    const runId = await makeRun("backlog", { status: "queued", createdAt: t(0) });
    await makeJob(runId, { status: "queued" });
    expect(await closeAbandonedRuns(now, WS)).not.toContain(runId);
    expect((await runRow(runId)).status).toBe("queued");
  });

  it("leaves a run started 5 minutes ago alone: its wall clock has not run out", async () => {
    const runId = await makeRun("recent", { status: "running", createdAt: t(40) });
    expect(await closeAbandonedRuns(now, WS)).not.toContain(runId);
  });

  it("never touches a finished run", async () => {
    const runId = await makeRun("finished long ago", { status: "succeeded", createdAt: t(0) });
    expect(await closeAbandonedRuns(now, WS)).not.toContain(runId);
    expect((await runRow(runId)).status).toBe("succeeded");
  });
});

// A stuck run closed only on the next start in its workspace: the person watching it saw "evaluating" for ever.
describe.skipIf(!process.env.DATABASE_URL)("a watched run that has outlived every runner", () => {
  afterAll(cleanup);
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const now = t(45);
  const seen = (createdAt: Date, status = "running") => ({ status, createdAt: createdAt.toISOString() });

  it("is closed when it is read, with the rest of its workspace's abandoned runs", async () => {
    vi.stubEnv("RUNNER", "route");
    const watched = await makeRun("watched while stuck", { status: "evaluating", createdAt: t(38) });
    const other = await makeRun("stuck beside it", { status: "running", createdAt: t(20) });
    expect(await sweepIfOverdue(WS, seen(t(38), "evaluating"), now)).toBe(true);
    expect((await runRow(watched)).status).toBe("failed");
    expect((await runRow(other)).status).toBe("failed");
  });

  it("sweeps nothing while the watched run is young enough to be alive", async () => {
    vi.stubEnv("RUNNER", "route");
    const old = await makeRun("stuck, not watched", { status: "running", createdAt: t(20) });
    expect(await sweepIfOverdue(WS, seen(t(42)), now)).toBe(false);
    expect((await runRow(old)).status).toBe("running"); // no sweep ran: a young run's read costs no write
  });

  it("sweeps nothing for a finished run, or with the worker, whose own recovery closes its runs", async () => {
    vi.stubEnv("RUNNER", "route");
    expect(await sweepIfOverdue(WS, seen(t(0), "succeeded"), now)).toBe(false);
    vi.stubEnv("RUNNER", "queue");
    const old = await makeRun("a worker's run", { status: "running", createdAt: t(20) });
    expect(await sweepIfOverdue(WS, seen(t(20)), now)).toBe(false);
    expect((await runRow(old)).status).toBe("running");
  });
});
