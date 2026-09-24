import { asc, desc, eq, and, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { RunEvent, type GetFile, type GetRun, type ListRuns, type Run, type RunStatus } from "@/contracts/run";
import { Verdict } from "@/contracts/eval";

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
  return headline === "pass" || headline === "pass_with_notes" || headline === "fail" || headline === "unknown" ? headline : null;
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
  const [row] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));
  if (!row) return null;
  const eventRows = await db.select().from(runEvents).where(eq(runEvents.runId, id)).orderBy(asc(runEvents.seq));
  // metadata only: a file's content (a spreadsheet's base64 included) is read by getFile when it is opened
  const fileRows = await db
    .select({ name: files.name, mime: files.mime, bytes: files.bytes, encoding: files.encoding, flags: files.flags, quarantined: files.quarantined })
    .from(files)
    .where(eq(files.runId, id))
    .orderBy(asc(files.name));
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

export const getFile: GetFile = async (workspaceId, runId, name) => {
  if (!isUuid(runId)) return null;
  if (name.includes("\0")) return null; // Postgres text cannot hold a NUL, so no stored name has one: it threw (Q200)
  const [owner] = await db.select({ id: runs.id }).from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)));
  if (!owner) return null;
  const [row] = await db.select().from(files).where(and(eq(files.runId, runId), eq(files.name, name)));
  if (!row) return null;
  const encoding = row.encoding === "base64" ? "base64" : "utf8";
  return { meta: { name: row.name, mime: row.mime, bytes: row.bytes, encoding, flags: row.flags ?? [], quarantined: row.quarantined }, content: row.content };
};
