import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { StartRunInput, type StartRun } from "@/contracts/agent";
import { AGENT_MODEL } from "@/lib/agent/run";
import { enqueueRun } from "@/lib/runner/enqueue";
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
  const { prompt } = StartRunInput.parse({ prompt: req.prompt }); // validated again here: the action is not the only caller

  // The workspace's own limits (runs and cost per day, runs in flight), then the per-address brake from v1.
  const over = await checkBudget(ctx.workspaceId);
  if (over) throw new RunLimitError(over);
  // In-flight is the workspace's limit now (checkBudget); the address bucket still stops one client flooding starts.
  const reason = req.purpose === "schedule" ? null : startBlockReason({ inFlight: 0, ip: await callerIp(ip), now: Date.now(), bucket: startsByIp });
  if (reason) throw new RunLimitError(reason);

  const [row] = await db
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

  await enqueueRun(row.id);
  return { id: row.id };
};
