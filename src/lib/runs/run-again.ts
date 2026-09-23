import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { instructionsOf } from "@/lib/agent/follow-up";
import { startRun } from "./start";

/**
 * "Run again": a new run of the brief this run answered, read here from the caller's workspace and never taken from
 * the browser. For a follow-up that is the whole thread (the first brief and every change), not its own prompt,
 * which is only the last change. null when the run is not the caller's.
 */
export async function startRunAgain(ctx: { workspaceId: string; userId: string | null }, runId: string, ip?: string | null): Promise<{ id: string } | null> {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, runId), eq(runs.workspaceId, ctx.workspaceId)));
  if (!run) return null;
  return startRun(ctx, { prompt: await instructionsOf(run, ctx.workspaceId) }, ip); // the same limits as any start
}
