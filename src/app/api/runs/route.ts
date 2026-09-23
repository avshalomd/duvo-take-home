import { ZodError } from "zod";
import { StartRunInput } from "@/contracts/agent";
import { sessionFromHeaders } from "@/lib/auth/session";
import { parseCommand } from "@/lib/automations/command";
import { AutomationError } from "@/lib/automations/errors";
import { runCommand } from "@/lib/automations/store";
import { clientIp } from "@/lib/runs/client-ip";
import { RunLimitError } from "@/lib/runs/limits";
import { listRuns } from "@/lib/runs/queries";
import { startRun } from "@/lib/runs/start";

export const runtime = "nodejs"; // the SDK spawns a subprocess; never the edge runtime
export const maxDuration = 300; // after() runs inside the route's budget, so the agent loop needs it

const BAD_BODY = 'Send JSON like {"prompt": "What the agent should do"}';

export async function GET(req: Request) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  return Response.json({ runs: await listRuns(session.workspaceId) });
}

/**
 * Start a run without the form: the id comes back at once and the agent keeps going. The same rule as Home: a text
 * that starts with \command or /command runs that saved automation (or is refused in its words), never paid free text.
 */
export async function POST(req: Request) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const body: unknown = await req.json().catch(() => null);
  // Plain words for a body that is not what we take, instead of Zod's "expected object, received null" (QA Q132).
  const text = body && typeof body === "object" && !Array.isArray(body) ? (body as { prompt?: unknown }).prompt : undefined;
  if (typeof text !== "string") return Response.json({ error: BAD_BODY }, { status: 400 });

  const ctx = { workspaceId: session.workspaceId, userId: session.userId };
  try {
    const command = parseCommand(text.trim());
    if (command) return Response.json(await runCommand(ctx, command), { status: 202 });

    const parsed = StartRunInput.safeParse({ prompt: text });
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? BAD_BODY }, { status: 400 });
    // the caller's address, so this route shares the form's per-client limit instead of being the way around it
    return Response.json(await startRun(ctx, { prompt: parsed.data.prompt }, clientIp(req.headers)), { status: 202 });
  } catch (e) {
    if (e instanceof RunLimitError) return Response.json({ error: e.message }, { status: 429 });
    if (e instanceof AutomationError) return Response.json({ error: e.message }, { status: 400 }); // unknown, unapproved, off, or no input
    // startRun validates again, whoever called it: a command's filled brief over 4000 characters was an empty 500 (Q197)
    if (e instanceof ZodError) return Response.json({ error: e.issues[0]?.message ?? BAD_BODY }, { status: 400 });
    throw e; // anything else is a real failure: let it be a 500 with a stack in the logs
  }
}
