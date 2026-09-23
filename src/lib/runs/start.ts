import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { transaction } from "@/db";
import { runs } from "@/db/schema";
import { FollowUpInput, StartRunInput, type StartRun } from "@/contracts/agent";
import { AGENT_MODEL } from "@/lib/agent/run";
import { enqueueRun } from "@/lib/runner/enqueue";
import { closeAbandonedRuns } from "@/lib/runner/recover";
import { checkBudget } from "@/lib/usage/budget";
import { clientIp } from "./client-ip";
import { RunLimitError, startBlockReason, startsByIp } from "./limits";

/** The route hands its own request headers in; the Server Action has none to hand, so it reads the request's. */
async function callerIp(given?: string | null): Promise<string> {
  if (given) return given;
  try {
    return clientIp(await headers());
  } catch {
    return "unknown"; // headers() throws outside a request scope (a script, a test, the worker): one caller
  }
}

/**
 * Insert the run in the caller's workspace and hand the id back at once; the runner executes it (after() inline,
 * or the worker). Every kind of start comes through here - the form, the API, a trial, a command, a schedule, a
 * follow-up - so the limits cannot differ between them.
 */
export const startRun: StartRun = async (ctx, req, ip) => {
  // Validated again here: the action is not the only caller. A follow-up's change is checked by its own, shorter
  // rule ("Fix the dates" is a whole request once the earlier run is the context).
  const prompt =
    req.purpose === "followup" ? FollowUpInput.shape.prompt.parse(req.prompt) : StartRunInput.parse({ prompt: req.prompt }).prompt;
  const address = req.purpose === "schedule" ? null : await callerIp(ip); // a schedule has no caller to brake

  const id = await transaction(async (tx) => {
    // One start at a time per workspace (QA Q87): the count and the insert run under one lock, so parallel starts
    // cannot all read the same count and all pass. The lock is released at commit, when the new row is visible to
    // the next start's count (checkBudget reads through its own connection, which sees committed rows only).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.workspaceId}))`);
    // A run stranded by a server restart would otherwise hold an in-flight slot for ever (QA Q84).
    await closeAbandonedRuns(new Date(), ctx.workspaceId);

    // The workspace's own limits (runs and cost per day, runs in flight), then the per-address brake from v1.
    const over = await checkBudget(ctx.workspaceId);
    if (over) throw new RunLimitError(over);
    // In-flight is the workspace's limit now (checkBudget); the address bucket still stops one client flooding starts.
    const reason = address === null ? null : startBlockReason({ inFlight: 0, ip: address, now: Date.now(), bucket: startsByIp });
    if (reason) throw new RunLimitError(reason);

    const [row] = await tx
      .insert(runs)
      .values({
        prompt,
        status: "queued",
        model: AGENT_MODEL,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
        purpose: req.purpose ?? "adhoc",
        automationId: req.automationId ?? null,
        automationVersion: req.automationVersion ?? null,
        input: req.input ?? null,
        parentRunId: req.parentRunId ?? null,
      })
      .returning({ id: runs.id });
    return row.id;
  });

  await enqueueRun(id); // after the commit: the worker's claim and after() must both see the row
  return { id };
};
