import { getRun, getVerdict } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // a polled run must never be answered from a cache

/** Everything the run page polls, in one request: the run, its events, its files and the derived key state. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // params is a Promise in Next 15+
  const found = await getRun(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  const verdict = await getVerdict(id);
  return Response.json({ ...found, verdict, state: deriveState(found.run, found.events) });
}
