// Tenancy of the run reads against the real tables. `npm run test:int`.
// A run and its file are written into workspace "int-a"; workspace "int-b" must not see them through any read.
// Everything it creates is named "[int] ..." and deleted in afterAll (the database is shared with other agents).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { countDbRequests } from "@/test/db-requests";
import { getFile, getRun, getRunSince, listRuns } from "./queries";

const WS_A = "int-a";
const WS_B = "int-b";
const FILE = "int-report.md";
const created: string[] = [];

beforeAll(async () => {
  const [run] = await db
    .insert(runs)
    .values({ workspaceId: WS_A, prompt: "[int] tenancy: a run of workspace A", status: "succeeded", model: "int-model" })
    .returning({ id: runs.id });
  created.push(run.id);
  await db.insert(files).values({ runId: run.id, name: FILE, mime: "text/markdown", bytes: 5, content: "hello" });
});

afterAll(async () => {
  if (created.length === 0) return;
  await db.delete(files).where(inArray(files.runId, created));
  await db.delete(runEvents).where(inArray(runEvents.runId, created));
  await db.delete(runs).where(inArray(runs.id, created));
});

describe.skipIf(!process.env.DATABASE_URL)("run reads are scoped to the workspace", () => {
  it("workspace A lists, opens and downloads its own run (the control)", async () => {
    const [id] = created;
    expect((await listRuns(WS_A)).map((r) => r.id)).toContain(id);
    const found = await getRun(WS_A, id);
    expect(found?.run.prompt).toBe("[int] tenancy: a run of workspace A");
    expect(found?.run.workspaceId).toBe(WS_A);
    expect(found?.files.map((f) => f.name)).toEqual([FILE]);
    expect((await getFile(WS_A, id, FILE))?.content).toBe("hello");
  });

  // Engine review #8: the list read every run's whole verdict and the run page every file's content, where only the
  // verdict's headline and the files' metadata are used. These pin what the lighter reads still return.
  it("the run list gives each run its outcome, read from the verdict's headline", async () => {
    const [judged] = await db
      .insert(runs)
      .values({ workspaceId: WS_A, prompt: "[int] outcome in the list", status: "succeeded", model: "int-model", verdict: { verdict: "pass_with_notes", checks: [], reasons: ["a note"] } })
      .returning({ id: runs.id });
    created.push(judged.id);
    const listed = (await listRuns(WS_A)).find((r) => r.id === judged.id);
    expect(listed?.outcome).toBe("pass_with_notes");
    expect(listed?.prompt).toBe("[int] outcome in the list");
  });

  it("the run page lists each file's name, type and size", async () => {
    const [id] = created;
    const found = await getRun(WS_A, id);
    expect(found?.files).toEqual([{ name: FILE, mime: "text/markdown", bytes: 5, encoding: "utf8", flags: [], quarantined: false }]);
  });

  it("workspace B does not see workspace A's run in its list", async () => {
    const [id] = created;
    expect((await listRuns(WS_B)).map((r) => r.id)).not.toContain(id);
  });

  it("workspace B opening workspace A's run gets null, as if it did not exist", async () => {
    const [id] = created;
    await expect(getRun(WS_B, id)).resolves.toBeNull();
  });

  it("workspace B downloading workspace A's file gets null, as if it did not exist", async () => {
    const [id] = created;
    await expect(getFile(WS_B, id, FILE)).resolves.toBeNull();
  });

  it("a run from before workspaces (no workspace) is visible to nobody", async () => {
    const [orphan] = await db
      .insert(runs)
      .values({ workspaceId: null, prompt: "[int] tenancy: a run with no workspace", status: "succeeded", model: "int-model" })
      .returning({ id: runs.id });
    created.push(orphan.id);
    await expect(getRun(WS_A, orphan.id)).resolves.toBeNull();
    expect((await listRuns(WS_A)).map((r) => r.id)).not.toContain(orphan.id);
    const [row] = await db.select({ id: runs.id }).from(runs).where(eq(runs.id, orphan.id));
    expect(row.id).toBe(orphan.id); // the row is there: it is the filter that hides it
  });

  // Review (frontend): the event stream read the whole run (every event, every file) once a second, to send the new ones
  it("getRunSince reads the run and only the events after the cursor, and nothing for another workspace", async () => {
    const [id] = created;
    const at = new Date("2026-09-24T10:00:00.000Z");
    await db.insert(runEvents).values([1, 2, 3].map((seq) => ({ runId: id, seq, kind: "text", payload: { text: `[int] step ${seq}` }, at })));
    const since = await getRunSince(WS_A, id, 1);
    expect(since?.run.id).toBe(id);
    expect(since?.events.map((e) => e.seq)).toEqual([2, 3]);
    expect((await getRunSince(WS_A, id, 3))?.events).toEqual([]);
    await expect(getRunSince(WS_B, id, 0)).resolves.toBeNull();
    await expect(getRunSince(WS_A, "not-a-uuid", 0)).resolves.toBeNull();
  });

  it("a malformed run id answers null instead of a database error", async () => {
    await expect(getRun(WS_A, "not-a-uuid")).resolves.toBeNull();
    await expect(getFile(WS_A, "------------------------------------", FILE)).resolves.toBeNull();
  });

  // Speed (moving between pages felt slow): the run page read the run, then its events, then its files - three round
  // trips one after another on every open. One request now, with each read still scoped to the workspace.
  it("a run with its events and files is read in one request to the database", async () => {
    const [run] = await db
      .insert(runs)
      .values({ workspaceId: WS_A, prompt: "[int] one request", status: "succeeded", model: "int-model" })
      .returning({ id: runs.id });
    created.push(run.id);
    const at = new Date("2026-09-24T10:00:00.000Z");
    await db.insert(runEvents).values([2, 1].map((seq) => ({ runId: run.id, seq, kind: "text", payload: { text: `[int] step ${seq}` }, at })));
    await db.insert(files).values(["b.md", "a.md"].map((name) => ({ runId: run.id, name, mime: "text/markdown", bytes: 1, content: "x" })));
    const { result, requests } = await countDbRequests(() => getRun(WS_A, run.id));
    expect(result?.run.prompt).toBe("[int] one request");
    expect(result?.events.map((e) => e.seq)).toEqual([1, 2]); // in order, as before
    expect(result?.files.map((f) => f.name)).toEqual(["a.md", "b.md"]);
    expect(requests).toBe(1);
  });

  it("another workspace's run is read in that one request too, and answers null with no events or files", async () => {
    const [id] = created;
    const { result, requests } = await countDbRequests(() => getRun(WS_B, id));
    expect(result).toBeNull();
    expect(requests).toBe(1);
  });

  // a CSV tile's facts read each file: the owner check and the file were two round trips one after the other
  it("a file is read in one request to the database, and not at all for another workspace", async () => {
    const [id] = created;
    const own = await countDbRequests(() => getFile(WS_A, id, FILE));
    expect(own.result?.content).toBe("hello");
    expect(own.requests).toBe(1);
    const other = await countDbRequests(() => getFile(WS_B, id, FILE));
    expect(other.result).toBeNull();
    expect(other.requests).toBe(1);
  });

  // Q200: /api/runs/<id>/files/%00 and notes.md%00.csv answered 500: Postgres text cannot hold a NUL byte.
  it("a file name with a NUL byte in it answers null instead of a database error", async () => {
    const [id] = created;
    await expect(getFile(WS_A, id, "\0")).resolves.toBeNull();
    await expect(getFile(WS_A, id, `${FILE}\0.csv`)).resolves.toBeNull();
  });
});
