import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, runs } from "@/db/schema";
import { carryOverPrompt, followUpInstructions } from "./follow-up-prompt";
import { restoreFiles } from "./restore-files";
import { resumeOptions } from "./session";

type RunRow = typeof runs.$inferSelect;
const MAX_THREAD = 20; // a thread of follow-ups longer than this is cut: the oldest changes are the least relevant

/** The instructions a run answers: its own prompt, or for a follow-up the thread's first prompt and every change since. */
export async function instructionsOf(run: RunRow, workspaceId: string): Promise<string> {
  const changes: string[] = [];
  let current = run;
  for (let hops = 0; current.purpose === "followup" && current.parentRunId && hops < MAX_THREAD; hops++) {
    changes.unshift(current.prompt);
    const [parent] = await db.select().from(runs).where(and(eq(runs.id, current.parentRunId), eq(runs.workspaceId, workspaceId)));
    if (!parent) break;
    current = parent;
  }
  return changes.reduce(followUpInstructions, current.prompt);
}

/**
 * Everything a follow-up needs before its agent starts: the parent's files back in the working directory (so the
 * agent edits them rather than starting over), the carry-over prompt, the instructions it is judged against, and
 * the SDK resume options when the parent's session is still on this machine (see session.ts for why).
 */
export async function prepareFollowUp(run: RunRow, dir: string) {
  const workspaceId = run.workspaceId ?? "";
  if (!run.parentRunId) throw new Error("This run does not continue another one");
  const [parent] = await db.select().from(runs).where(and(eq(runs.id, run.parentRunId), eq(runs.workspaceId, workspaceId)));
  if (!parent) throw new Error("The run this change continues was not found");

  const stored = await db.select().from(files).where(eq(files.runId, parent.id)).orderBy(asc(files.name));
  // A quarantined file holds a credential: it is not handed back to an agent that reads the open web.
  const restored = await restoreFiles(dir, stored.filter((f) => !f.quarantined));

  const parentInstructions = await instructionsOf(parent, workspaceId);
  return {
    prompt: carryOverPrompt({ prompt: parentInstructions, report: parent.report, files: restored }, run.prompt),
    instructions: followUpInstructions(parentInstructions, run.prompt),
    resume: await resumeOptions(parent.sessionId),
  };
}
