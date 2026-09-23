import { StartRunInput } from "@/contracts/agent";
import { sessionFromHeaders } from "@/lib/auth/session";
import { clientIp } from "@/lib/runs/client-ip";
import { RunLimitError } from "@/lib/runs/limits";
import { listRuns } from "@/lib/runs/queries";
import { startRun } from "@/lib/runs/start";

export const runtime = "nodejs"; // the SDK spawns a subprocess; never the edge runtime
export const maxDuration = 300; // after() runs inside the route's budget, so the agent loop needs it

export async function GET(req: Request) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  return Response.json({ runs: await listRuns(session.workspaceId) });
}

/** Start a run without the form: the id comes back at once and the agent keeps going in after(). */
export async function POST(req: Request) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = StartRunInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  try {
    // the caller's address, so this route shares the form's per-client limit instead of being the way around it
    return Response.json(await startRun({ workspaceId: session.workspaceId, userId: session.userId }, { prompt: parsed.data.prompt }, clientIp(req.headers)), { status: 202 });
  } catch (e) {
    if (e instanceof RunLimitError) return Response.json({ error: e.message }, { status: 429 });
    throw e; // anything else is a real failure: let it be a 500 with a stack in the logs
  }
}
