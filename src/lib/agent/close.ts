import "server-only";
import type { runs } from "@/db/schema";

type RunFields = Partial<typeof runs.$inferInsert>;

/** Every update the loop makes to its run after the start: never over a run that was already cancelled. */
export async function updateUnlessCancelled(runId: string, fields: RunFields): Promise<boolean> {
  throw new Error(`not implemented: updateUnlessCancelled(${runId}, ${Object.keys(fields)})`);
}

/** Close a run the user stopped: "cancelled", "Stopped by you", no verdict; the files already stored stay. */
export async function closeAsCancelled(runId: string, fields: RunFields = {}): Promise<void> {
  throw new Error(`not implemented: closeAsCancelled(${runId}, ${Object.keys(fields)})`);
}
