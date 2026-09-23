// Tenancy of the run reads against the real tables. `npm run test:int`.
// A run and its file are written into workspace "int-a"; workspace "int-b" must not see them through any read.
// Everything it creates is named "[int] ..." and deleted in afterAll (the database is shared with other agents).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { files, runs } from "@/db/schema";
import { getFile, getRun, listRuns } from "./queries";

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

  it("a malformed run id answers null instead of a database error", async () => {
    await expect(getRun(WS_A, "not-a-uuid")).resolves.toBeNull();
    await expect(getFile(WS_A, "------------------------------------", FILE)).resolves.toBeNull();
  });

  // Q200: /api/runs/<id>/files/%00 and notes.md%00.csv answered 500: Postgres text cannot hold a NUL byte.
  it("a file name with a NUL byte in it answers null instead of a database error", async () => {
    const [id] = created;
    await expect(getFile(WS_A, id, "\0")).resolves.toBeNull();
    await expect(getFile(WS_A, id, `${FILE}\0.csv`)).resolves.toBeNull();
  });
});
