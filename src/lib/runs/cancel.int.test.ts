// Stop, against the real tables. `npm run test:int`. Runs are "[int] ..." in workspace "int-engine-cancel", deleted after.
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { jobs, runs } from "@/db/schema";
import { closeAsCancelled, updateUnlessCancelled } from "@/lib/agent/close";
import { cancelRun } from "./cancel";

const WS = `int-engine-cancel-${process.pid}`; // per process: other worktrees run these tests against the same database
const OTHER_WS = `int-engine-cancel-other-${process.pid}`; // per process: other worktrees run these tests against the same database

async function makeRun(what: string, status: string, ws = WS) {
  const [row] = await db.insert(runs).values({ prompt: `[int] ${what}`, status, model: "test", workspaceId: ws }).returning({ id: runs.id });
  return row.id;
}
const runRow = async (id: string) => (await db.select().from(runs).where(eq(runs.id, id)))[0];

afterAll(async () => {
  const mine = db.select({ id: runs.id }).from(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
  await db.delete(jobs).where(inArray(jobs.runId, mine));
  await db.delete(runs).where(inArray(runs.workspaceId, [WS, OTHER_WS]));
});

describe.skipIf(!process.env.DATABASE_URL)("cancelRun", () => {
  it("closes a queued run at once as cancelled, 'Stopped by you', with a finish time", async () => {
    const id = await makeRun("queued", "queued");
    await cancelRun(WS, id);
    const run = await runRow(id);
    expect(run.status).toBe("cancelled");
    expect(run.error).toBe("Stopped by you");
    expect(run.finishedAt).not.toBeNull();
    expect(run.cancelRequestedAt).not.toBeNull();
  });

  it("takes a queued run's job off the queue, so no worker starts it", async () => {
    const id = await makeRun("queued with a job", "queued");
    const [job] = await db.insert(jobs).values({ runId: id }).returning({ id: jobs.id });
    await cancelRun(WS, id);
    expect((await db.select().from(jobs).where(eq(jobs.id, job.id)))[0].status).toBe("done");
  });

  it("asks a running run to stop and leaves closing it to its loop", async () => {
    const id = await makeRun("running", "running");
    await cancelRun(WS, id);
    const run = await runRow(id);
    expect(run.cancelRequestedAt).not.toBeNull();
    expect(run.status).toBe("running"); // the loop aborts within 2 s and keeps the files written so far
  });

  it("asks a run in evaluation to stop the same way", async () => {
    const id = await makeRun("evaluating", "evaluating");
    await cancelRun(WS, id);
    const run = await runRow(id);
    expect(run.cancelRequestedAt).not.toBeNull();
    expect(run.status).toBe("evaluating");
  });

  // A run whose function Vercel ended never reads the request: Stop only set cancel_requested_at, and the run stayed
  // "evaluating" in front of the person who pressed it.
  it("closes a run that has outlived every runner as stopped, when Stop is pressed on it", async () => {
    vi.stubEnv("RUNNER", "route");
    const [row] = await db
      .insert(runs)
      .values({ prompt: "[int] stuck past its function", status: "evaluating", model: "test", workspaceId: WS, createdAt: new Date(Date.now() - 7 * 60_000) })
      .returning({ id: runs.id });
    await cancelRun(WS, row.id);
    const run = await runRow(row.id);
    expect(run.status).toBe("cancelled");
    expect(run.error).toBe("Stopped by you");
    expect(run.finishedAt).not.toBeNull();
    vi.unstubAllEnvs();
  });

  it("keeps the first request time when Stop is pressed twice", async () => {
    const id = await makeRun("twice", "running");
    await cancelRun(WS, id);
    const first = (await runRow(id)).cancelRequestedAt;
    await new Promise((r) => setTimeout(r, 20));
    await cancelRun(WS, id);
    expect((await runRow(id)).cancelRequestedAt).toEqual(first);
  });

  it("refuses a finished run in plain words", async () => {
    const id = await makeRun("succeeded", "succeeded");
    await expect(cancelRun(WS, id)).rejects.toThrow("This run has already finished");
    expect((await runRow(id)).status).toBe("succeeded");
  });

  it("reads another workspace's run as not found, and leaves it running", async () => {
    const id = await makeRun("theirs", "running", OTHER_WS);
    await expect(cancelRun(WS, id)).rejects.toThrow("This run was not found");
    expect((await runRow(id)).cancelRequestedAt).toBeNull();
  });

  it("reads an id that is not a uuid as not found instead of a database error", async () => {
    await expect(cancelRun(WS, "not-a-uuid")).rejects.toThrow("This run was not found");
  });
});

describe.skipIf(!process.env.DATABASE_URL)("closing a run", () => {
  it("never overwrites a cancelled run with the loop's closing update", async () => {
    const id = await makeRun("cancelled before the close", "cancelled");
    const wrote = await updateUnlessCancelled(id, { status: "succeeded", finishedAt: new Date() });
    expect(wrote).toBe(false);
    expect((await runRow(id)).status).toBe("cancelled");
  });

  it("updates a run that was not cancelled", async () => {
    const id = await makeRun("evaluating to succeeded", "evaluating");
    expect(await updateUnlessCancelled(id, { status: "succeeded" })).toBe(true);
    expect((await runRow(id)).status).toBe("succeeded");
  });

  it("closeAsCancelled closes a running run as 'Stopped by you' with a finish time and no verdict", async () => {
    const id = await makeRun("stopped mid-way", "running");
    await closeAsCancelled(id, { numTurns: 3 });
    const run = await runRow(id);
    expect(run.status).toBe("cancelled");
    expect(run.error).toBe("Stopped by you");
    expect(run.finishedAt).not.toBeNull();
    expect(run.verdict).toBeNull();
    expect(run.numTurns).toBe(3);
  });
});
