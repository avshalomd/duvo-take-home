import { asc, desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { files, runEvents, runs } from "@/db/schema";
import { RunEvent, type GetFile, type GetRun, type ListRuns, type Run, type RunStatus } from "@/contracts/run";
import { Verdict } from "@/contracts/eval";

// A real uuid shape, not just 36 hex-or-dash characters: 36 dashes reached Postgres and threw (QA, round 2).
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

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
    outcome: outcomeOf(row.verdict),
    workspaceId: row.workspaceId,
    purpose: (row.purpose ?? "adhoc") as Run["purpose"],
    automationId: row.automationId,
    automationVersion: row.automationVersion,
    input: row.input,
    parentRunId: row.parentRunId,
    cancelRequested: row.cancelRequestedAt != null,
    humanVerdict: row.humanVerdict === "approved" || row.humanVerdict === "rejected" ? row.humanVerdict : null,
    humanNote: row.humanNote,
    healAttempts: row.healAttempts ?? 0, // the rail and the page read the same count of fixes
  };
}

/** The stored verdict's headline, or null when the run was never judged or the stored shape is unknown. */
function outcomeOf(verdict: unknown): Run["outcome"] {
  const v = (verdict as { verdict?: unknown } | null)?.verdict;
  return v === "pass" || v === "pass_with_notes" || v === "fail" || v === "unknown" ? v : null;
}

// Tenancy: every read filters on the workspace from the session. A run of another workspace reads as "not found",
// never as "forbidden", so its existence does not leak either.
export const listRuns: ListRuns = async (workspaceId) => {
  const rows = await db.select().from(runs).where(eq(runs.workspaceId, workspaceId)).orderBy(desc(runs.createdAt)).limit(100);
  return rows.map(toRun);
};

export const getRun: GetRun = async (workspaceId, id) => {
  if (!isUuid(id)) return null; // a non-uuid id would make Postgres throw, not return nothing
  const [row] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));
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
