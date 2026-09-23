import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";

/** RUNNER=route: the runner could not take the run. Close it as failed while it is still queued, so it never waits forever. */
export async function failStart(runId: string): Promise<void> {
  await db
    .update(runs)
    .set({ status: "failed", error: "The run could not start. Try again in a moment.", finishedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.status, "queued"))); // a runner that did take it has moved it on: leave it
}
