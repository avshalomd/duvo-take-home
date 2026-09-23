import { closeAbandonedRuns } from "@/lib/runner/recover";
import { tickSchedules } from "@/lib/runner/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel cron's path: the schedules that are due, and the runs nobody will close. */
export async function GET(req: Request) {
  throw new Error(`not implemented: cron tick (${req.url}, ${typeof tickSchedules}, ${typeof closeAbandonedRuns})`);
}
