import { sessionFromHeaders } from "@/lib/auth/session";
import { getRun } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // a polled run must never be answered from a cache

/** Everything the run page polls, in one request: the run, its events, its files and the derived key state. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const { id } = await params; // params is a Promise in Next 15+
  const found = await getRun(session.workspaceId, id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ...found, state: deriveState(found.run, found.events) });
}
