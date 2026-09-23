import { closeAbandonedRuns } from "@/lib/runner/recover";
import { tickSchedules } from "@/lib/runner/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // inline, a schedule's run goes into this request's after(), like a start from the form

/**
 * Vercel cron's path (the worker calls the same functions directly): the schedules that are due, and the runs
 * nobody will ever close. Vercel sends `Authorization: Bearer $CRON_SECRET`; anyone else gets 401.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured is a setup error, never "open to all": this route starts paid runs.
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const started = await tickSchedules(now);
  const closed = await closeAbandonedRuns(now);
  return Response.json({ started, closed });
}
