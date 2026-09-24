import { sessionFromHeaders } from "@/lib/auth/session";
import { sweepIfOverdue } from "@/lib/runner/recover";
import { getRunSince } from "@/lib/runs/queries";
import { nextMessage, parseAfter, sseFrame } from "./diff";

export const runtime = "nodejs"; // a long-lived stream and the database driver: not the edge runtime
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EVERY_MS = 1000;
// Under maxDuration: the stream ends on its own with done=false and the client reconnects with ?after=<last seq>.
const STREAM_MS = 280_000;
// The session is checked again every this many reads (~15 s): someone removed from the workspace, or signed out
// elsewhere, stops receiving the run then, not when the stream would end on its own.
const RECHECK_EVERY = 15;

/** Whether the request's session still names this workspace: read again from the cookie and the memberships. */
async function stillIn(req: Request, workspaceId: string): Promise<boolean> {
  return (await sessionFromHeaders(req.headers))?.workspaceId === workspaceId;
}

/** Wait between reads, cut short when the client goes away. The listener is removed each time, or 280 would pile up. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

/**
 * The run as server-sent events: every second, the events after the client's cursor and the run as it is now, read
 * from the database like the polling route (/api/runs/<id> stays as the fallback). Ends with one last message once
 * the run is finished, and stops reading as soon as the client goes away or the session no longer names the workspace.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  const { id } = await params;
  const workspaceId = session.workspaceId;
  let after = parseAfter(new URL(req.url).searchParams.get("after"));
  // Checked before the stream opens, so another workspace's run is a plain 404 and not an empty stream.
  if (!(await getRunSince(workspaceId, id, after))) return Response.json({ error: "not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const until = Date.now() + STREAM_MS;
  // The client leaving arrives two ways: the request's signal, or the stream being cancelled. Either one stops the
  // loop, and wakes it from its wait at once, so it never writes into a closed stream (QA Q131).
  const gone = new AbortController();
  if (req.signal.aborted) gone.abort();
  req.signal.addEventListener("abort", () => gone.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let reads = 0; !gone.signal.aborted && Date.now() < until; reads++) {
          if (reads > 0 && reads % RECHECK_EVERY === 0 && !(await stillIn(req, workspaceId))) break; // the client's next try is refused
          // the run and only its new events: a long run is not read whole every second (files come with the done payload)
          let found = await getRunSince(workspaceId, id, after);
          if (gone.signal.aborted) break; // left during the read: there is nobody to send it to
          if (!found) break; // deleted while streaming
          // A run that has outlived every runner is closed now, while someone watches it, and sent closed.
          if (await sweepIfOverdue(workspaceId, found.run)) found = (await getRunSince(workspaceId, id, after)) ?? found;
          const next = nextMessage(found, after);
          after = next.after;
          controller.enqueue(encoder.encode(sseFrame(next.message)));
          if (next.message.done) break; // that was the last message
          await sleep(EVERY_MS, gone.signal);
        }
      } catch (e) {
        if (!gone.signal.aborted) console.error(`events stream of run ${id} failed`, e); // the client falls back to polling
      } finally {
        if (!gone.signal.aborted) controller.close(); // a cancelled stream is closed already
      }
    },
    cancel() {
      gone.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform", // no proxy may buffer or rewrite the stream
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
