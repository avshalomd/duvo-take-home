import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import { count, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { StartRunInput, type StartRun } from "@/contracts/agent";
import { AGENT_MODEL, runAutomation } from "@/lib/agent/run";
import { clientIp } from "./client-ip";
import { IN_FLIGHT_STATUSES, RunLimitError, startBlockReason, startsByIp } from "./limits";

/** The route hands its own request headers in; the Server Action has none to hand, so it reads the request's. */
async function callerIp(given?: string | null): Promise<string> {
  if (given) return given;
  try {
    return clientIp(await headers());
  } catch {
    return "unknown"; // headers() throws outside a request scope (a script, a test): treat it as one caller
  }
}

/**
 * Insert the run and hand the id back at once; the agent loop runs in after(), so the caller is not held for
 * the minutes the agent takes. The page then polls /api/runs/[id].
 *
 * Both limits live here, not in the callers, so the form and POST /api/runs cannot differ (QA Q47/Q54).
 */
// `satisfies StartRun` is the proof the contract still holds: the ip is an optional second argument, so the
// Server Action keeps calling startRun(input) while the route can name the caller.
export const startRun = (async (input: StartRunInput, ip?: string | null): Promise<{ id: string }> => {
  const { prompt } = StartRunInput.parse(input); // validated again here: the action is not the only caller

  // Cheap enough per start, and it reads the runs table rather than a counter that could drift. Two starts landing
  // in the same millisecond can both see 2 and both pass; a fourth run is a cost bug, not a correctness one.
  const [{ inFlight }] = await db
    .select({ inFlight: count() })
    .from(runs)
    .where(inArray(runs.status, [...IN_FLIGHT_STATUSES]));
  const reason = startBlockReason({ inFlight, ip: await callerIp(ip), now: Date.now(), bucket: startsByIp });
  if (reason) throw new RunLimitError(reason);

  const [row] = await db.insert(runs).values({ prompt, status: "queued", model: AGENT_MODEL }).returning({ id: runs.id });

  after(async () => {
    try {
      await runAutomation(row.id);
    } catch (err) {
      // after() swallows rejections: log it, the run row itself is closed as failed inside runAutomation.
      console.error(`run ${row.id} failed`, err);
    }
  });

  return { id: row.id };
}) satisfies StartRun;
