import { asc, desc, eq, and, gt, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { RunEvent, type GetFile, type GetRun, type ListRuns, type Run, type RunStatus } from "@/contracts/run";
import { Verdict, VerdictKind } from "@/contracts/eval";

// A real uuid shape, not just 36 hex-or-dash characters: 36 dashes reached Postgres and threw (QA, round 2).
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type RunRow = typeof runs.$inferSelect;

function toRun(row: Omit<RunRow, "verdict">, outcome: Run["outcome"]): Run {
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
    outcome,
    workspaceId: row.workspaceId,
    purpose: (row.purpose ?? "adhoc") as Run["purpose"],
    automationId: row.automationId,
    automationVersion: row.automationVersion,
    input: row.input,
    parentRunId: row.parentRunId,
    cancelRequested: row.cancelRequestedAt != null,
    humanVerdict: row.humanVerdict === "approved" || row.humanVerdict === "rejected" ? row.humanVerdict : null,
    humanVerdictBy: row.humanVerdictBy,
    humanNote: row.humanNote,
    healAttempts: row.healAttempts ?? 0, // the rail and the page read the same count of fixes
  };
}

/** The stored verdict's headline, or null when the run was never judged or the stored shape is unknown. */
function outcomeOf(headline: unknown): Run["outcome"] {
  const parsed = VerdictKind.safeParse(headline); // "could not be done" and "needs your answer" too (qa-ai F3)
  return parsed.success ? parsed.data : null;
}

// The list needs only the verdict's headline, not the whole jsonb with its checks and review (engine review #8).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the one column left out of the list
const { verdict, ...listColumns } = getTableColumns(runs);
const headline = sql<string | null>`${runs.verdict}->>'verdict'`;

// Tenancy: every read filters on the workspace from the session. A run of another workspace reads as "not found",
// never as "forbidden", so its existence does not leak either.
export const listRuns: ListRuns = async (workspaceId) => {
  const rows = await db
    .select({ ...listColumns, headline })
    .from(runs)
    .where(eq(runs.workspaceId, workspaceId))
    .orderBy(desc(runs.createdAt))
    .limit(100);
  return rows.map((row) => toRun(row, outcomeOf(row.headline)));
};

export const getRun: GetRun = async (workspaceId, id) => {
  if (!isUuid(id)) return null; // a non-uuid id would make Postgres throw, not return nothing
  // One request, not three one after another (every run opened waited for each): db.batch sends the reads together.
  // The events and the files are read only through a run of this workspace, so another workspace's come back empty.
  const own = and(eq(runs.id, id), eq(runs.workspaceId, workspaceId));
  const ownRun = db.select({ id: runs.id }).from(runs).where(own);
  const [[row], eventRows, fileRows] = await db.batch([
    db.select().from(runs).where(own),
    db.select().from(runEvents).where(and(eq(runEvents.runId, id), inArray(runEvents.runId, ownRun))).orderBy(asc(runEvents.seq)),
    // metadata only: a file's content (a spreadsheet's base64 included) is read by getFile when it is opened
    db
      .select({ name: files.name, mime: files.mime, bytes: files.bytes, encoding: files.encoding, flags: files.flags, quarantined: files.quarantined })
      .from(files)
      .where(and(eq(files.runId, id), inArray(files.runId, ownRun)))
      .orderBy(asc(files.name)),
  ]);
  if (!row) return null;
  // jsonb is only typed at compile time: parse each row against the contract and drop what does not fit,
  // so one odd row from an older shape cannot break the whole run page.
  const events = eventRows
    .map((e) => RunEvent.safeParse({ seq: e.seq, at: e.at.toISOString(), kind: e.kind, payload: e.payload }))
    .filter((r) => r.success)
    .map((r) => r.data);
  // The verdict is stored whole on the run so a pass or fail can be defended later; parsed here, not trusted raw.
  const verdict = Verdict.safeParse(row.verdict);
  return {
    run: toRun(row, outcomeOf((row.verdict as { verdict?: unknown } | null)?.verdict)),
    events,
    files: fileRows.map((f) => ({ name: f.name, mime: f.mime, bytes: f.bytes, encoding: f.encoding === "base64" ? "base64" : "utf8", flags: f.flags ?? [], quarantined: f.quarantined })),
    verdict: verdict.success ? verdict.data : null,
  };
};

/**
 * The run as it is now and only its events after `after` (a seq): what the event stream sends each second. No files
 * and no verdict: the client reads the full run once the stream says it is done. Scoped like getRun.
 */
export async function getRunSince(workspaceId: string, id: string, after: number): Promise<{ run: Run; events: RunEvent[] } | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));
  if (!row) return null;
  const eventRows = await db.select().from(runEvents).where(and(eq(runEvents.runId, id), gt(runEvents.seq, after))).orderBy(asc(runEvents.seq));
  const events = eventRows
    .map((e) => RunEvent.safeParse({ seq: e.seq, at: e.at.toISOString(), kind: e.kind, payload: e.payload }))
    .filter((r) => r.success)
    .map((r) => r.data); // parsed against the contract, as getRun does
  return { run: toRun(row, outcomeOf((row.verdict as { verdict?: unknown } | null)?.verdict)), events };
}

export const getFile: GetFile = async (workspaceId, runId, name) => {
  if (!isUuid(runId)) return null;
  if (name.includes("\0")) return null; // Postgres text cannot hold a NUL, so no stored name has one: it threw (Q200)
  // the file and the workspace check in one query: the file only through a run of this workspace
  const [row] = await db
    .select(getTableColumns(files))
    .from(files)
    .innerJoin(runs, eq(runs.id, files.runId))
    .where(and(eq(files.runId, runId), eq(files.name, name), eq(runs.workspaceId, workspaceId)));
  if (!row) return null;
  const encoding = row.encoding === "base64" ? "base64" : "utf8";
  return { meta: { name: row.name, mime: row.mime, bytes: row.bytes, encoding, flags: row.flags ?? [], quarantined: row.quarantined }, content: row.content };
};
