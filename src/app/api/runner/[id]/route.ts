import { after } from "next/server";
import { runAutomation } from "@/lib/agent/run";
import { verifyRunnerToken } from "@/lib/runner/token";

export const runtime = "nodejs"; // the SDK spawns a subprocess; never the edge runtime
export const maxDuration = 300; // after() runs inside this route's budget, so the agent loop needs it

/**
 * RUNNER=route: the one function that runs agents on Vercel, and so the only one next.config.ts gives the agent's
 * binary. enqueueRun posts each run here with the run's token; it answers 202 at once and runs the loop in after().
 * The run's own claim (queued -> running) means a second call for the same run starts nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  if (!verifyRunnerToken(id, token)) return Response.json({ error: "unauthorized" }, { status: 401 });

  after(async () => {
    try {
      await runAutomation(id);
    } catch (err) {
      console.error(`run ${id} failed`, err); // after() swallows rejections; the run row is closed inside runAutomation
    }
  });
  return new Response(null, { status: 202 });
}
