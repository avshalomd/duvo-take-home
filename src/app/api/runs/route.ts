import { StartRunInput } from "@/contracts/agent";
import { listRuns } from "@/lib/runs/queries";
import { startRun } from "@/lib/runs/start";

export const runtime = "nodejs"; // the SDK spawns a subprocess; never the edge runtime
export const maxDuration = 300; // after() runs inside the route's budget, so the agent loop needs it

export async function GET() {
  return Response.json({ runs: await listRuns() });
}

/** Start a run without the form: the id comes back at once and the agent keeps going in after(). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = StartRunInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  return Response.json(await startRun(parsed.data), { status: 202 });
}
