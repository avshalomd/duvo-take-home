import { sessionFromHeaders } from "@/lib/auth/session";
import { sweepIfOverdue } from "@/lib/runner/recover";
import { getRun } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";
import { withoutMachinePaths } from "@/lib/runs/without-machine-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // a polled run must never be answered from a cache

/** Everything the run page polls, in one request: the run, its events, its files and the derived key state. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const { id } = await params; // params is a Promise in Next 15+
  let found = await getRun(session.workspaceId, id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  // A run that has outlived every runner is closed now, while someone watches it, and answered closed.
  if (await sweepIfOverdue(session.workspaceId, found.run)) found = (await getRun(session.workspaceId, id)) ?? found;
  const answer = withoutMachinePaths(found); // paths as the page shows them, not the machine's folder (F20)
  return Response.json({ ...answer, state: deriveState(answer.run, answer.events) });
}
