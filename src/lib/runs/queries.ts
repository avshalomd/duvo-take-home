// A real uuid shape, not just 36 hex-or-dash characters: 36 dashes reached Postgres and threw (QA, round 2).
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
import { asc, desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { RunEvent, type GetFile, type GetRun, type ListRuns, type Run, type RunStatus } from "@/contracts/run";
import { Verdict } from "@/contracts/eval";

type RunRow = typeof runs.$inferSelect;

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    prompt: row.prompt,
    status: row.status as RunStatus,
    model: row.model,
    connectionIds: row.connectionIds ?? [],
    report: row.report,
    error: row.error,
    numTurns: row.numTurns,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export const listRuns: ListRuns = async () => {
  const rows = await db.select().from(runs).orderBy(desc(runs.createdAt)).limit(50);
  return rows.map(toRun);
};

export const getRun: GetRun = async (id) => {
  if (!isUuid(id)) return null; // a non-uuid id would make Postgres throw, not return nothing
  const [row] = await db.select().from(runs).where(eq(runs.id, id));
  if (!row) return null;
  const eventRows = await db.select().from(runEvents).where(eq(runEvents.runId, id)).orderBy(asc(runEvents.seq));
  const fileRows = await db.select().from(files).where(eq(files.runId, id)).orderBy(asc(files.name));
  // jsonb is only typed at compile time: parse each row against the contract and drop what does not fit,
  // so one odd row from an older shape cannot break the whole run page.
  const events = eventRows
    .map((e) => RunEvent.safeParse({ seq: e.seq, at: e.at.toISOString(), kind: e.kind, payload: e.payload }))
    .filter((r) => r.success)
    .map((r) => r.data);
  // The verdict is stored whole on the run so a pass or fail can be defended later; parsed here, not trusted raw.
  const verdict = Verdict.safeParse(row.verdict);
  return {
    run: toRun(row),
    events,
    files: fileRows.map((f) => ({ name: f.name, mime: f.mime, bytes: f.bytes })),
    verdict: verdict.success ? verdict.data : null,
  };
};

export const getFile: GetFile = async (runId, name) => {
  if (!isUuid(runId)) return null;
  const [row] = await db.select().from(files).where(and(eq(files.runId, runId), eq(files.name, name)));
  return row ? { meta: { name: row.name, mime: row.mime, bytes: row.bytes }, content: row.content } : null;
};
