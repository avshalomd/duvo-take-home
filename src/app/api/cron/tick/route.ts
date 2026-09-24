import { timingSafeEqual } from "node:crypto";
import { closeAbandonedRuns } from "@/lib/runner/recover";
import { tickSchedules } from "@/lib/runner/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // inline, a schedule's run goes into this request's after(), like a start from the form

/** Constant time (security review S12): `!==` stops at the first differing character and leaks how much matched. */
function sameSecret(given: string | null, secret: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b); // equal length first: timingSafeEqual throws otherwise
}

/**
 * Vercel cron's path (the worker calls the same functions directly): the schedules that are due, and the runs
 * nobody will ever close. Vercel sends `Authorization: Bearer $CRON_SECRET`; anyone else gets 401.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured: the route is off, never "open to all" (it starts paid runs). A plain 404 names no setting (F23).
  if (!secret) return new Response("Not found", { status: 404 });
  if (!sameSecret(req.headers.get("authorization"), secret)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const now = new Date();
  const started = await tickSchedules(now);
  const closed = await closeAbandonedRuns(now);
  return Response.json({ started, closed });
}
