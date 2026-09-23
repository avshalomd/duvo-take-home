import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { STOPPED_BY_YOU } from "@/lib/runs/cancel-rule";
import { IN_FLIGHT } from "@/lib/runner/status";

type RunFields = Partial<typeof runs.$inferInsert>;

/**
 * Every update the loop makes to its run after the start: never over a run that was already cancelled. The
 * condition is in the statement itself, so a Stop that lands between the loop's read and its write still wins.
 * Returns false when the run was cancelled and nothing was written.
 */
export async function updateUnlessCancelled(runId: string, fields: RunFields): Promise<boolean> {
  const written = await db
    .update(runs)
    .set(fields)
    .where(and(eq(runs.id, runId), ne(runs.status, "cancelled")))
    .returning({ id: runs.id });
  return written.length > 0;
}

/** Close a run the user stopped: "cancelled", "Stopped by you", no verdict; the files already stored stay. */
export async function closeAsCancelled(runId: string, fields: RunFields = {}): Promise<void> {
  await db
    .update(runs)
    .set({ ...fields, status: "cancelled", error: STOPPED_BY_YOU, verdict: null, finishedAt: new Date() })
    .where(and(eq(runs.id, runId), inArray(runs.status, [...IN_FLIGHT]))); // a run that already closed keeps its ending
}
