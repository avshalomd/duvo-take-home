import { sessionFromHeaders } from "@/lib/auth/session";
import { cancelRun, CancelError } from "@/lib/runs/cancel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stop a run, for API callers (the Home page's Stop button goes through its Server Action instead). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const { id } = await params;
  try {
    await cancelRun(session.workspaceId, id); // the workspace comes from the session, never from the request
    // 202: a queued run is closed already, a running one within 2 s; the run's own status says which
    return Response.json({ ok: true }, { status: 202 });
  } catch (e) {
    if (e instanceof CancelError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
