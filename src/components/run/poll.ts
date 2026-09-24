import { z } from "zod";
import { Verdict } from "@/contracts/eval";
import { FileMeta, Run, RunEvent, RunState } from "@/contracts/run";
import { deriveState } from "@/lib/runs/state";
import type { RunView } from "./types";

// What GET /api/runs/[id] answers. Validating it here is the boundary check: the panel is a client and the
// route is a separate package, so a shape that drifted must be caught, not rendered.
const Payload = z.object({
  run: Run,
  events: z.array(RunEvent),
  files: z.array(FileMeta),
  state: RunState,
  verdict: Verdict.nullable().default(null),
});

// What each message of the events stream (GET /api/runs/[id]/events, server-sent) carries: no files and no verdict,
// which only exist once the run has ended - the panel fetches the full payload once when done is true.
const Message = z.object({ events: z.array(RunEvent), run: Run, done: z.boolean() });
export type StreamMessage = z.infer<typeof Message>;

export function shouldPoll(status: string): boolean {
  return status === "queued" || status === "running" || status === "evaluating";
}

// A run that has settled. The panel polls until then; the runs list beside it is a server render, so reaching
// this is also the moment to ask the server for a fresh page (Q79: the row said "Working on it" until a reload).
export function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

const RECONNECT_MS = [1000, 2000, 5000];

/** How long to wait before opening a broken stream again, by how many times in a row it has broken: 1 s, 2 s, then 5 s. */
export function reconnectDelay(breaks: number): number {
  return RECONNECT_MS[Math.min(breaks, RECONNECT_MS.length - 1)];
}

/** A poll's answer that no later poll will change: the run is gone (404), or the session ended or lost access (401, 403). */
export function pollGivesUp(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}

export function parseRunPayload(json: unknown): RunView | null {
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return null; // a 404 or a changed payload keeps the last good view instead of blanking it
  return parsed.data;
}

/** The run's event stream, asking only for the events after the last one the panel already has (the route's ?after). */
export function streamUrl(runId: string, events: RunEvent[]): string {
  if (events.length === 0) return `/api/runs/${runId}/events`;
  return `/api/runs/${runId}/events?after=${Math.max(...events.map((e) => e.seq))}`;
}

export function parseStreamMessage(json: unknown): StreamMessage | null {
  const parsed = Message.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Folds one stream message into the view. The events are merged by seq, so it does not matter whether the stream
 * sends every event each time or only the new ones; the key state is derived again, exactly as the server does.
 */
export function mergeStreamMessage(view: RunView, msg: StreamMessage): RunView {
  const bySeq = new Map(view.events.map((e) => [e.seq, e]));
  for (const e of msg.events) bySeq.set(e.seq, e);
  const events = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  return { ...view, run: msg.run, events, state: deriveState(msg.run, events) };
}

// How far along a view is: more events, a newer verdict, or Stop having been pressed, means it is the later picture.
function freshness(view: RunView): [number, string, number] {
  return [view.events.length, view.verdict?.evaluatedAt ?? "", view.run.cancelRequested ? 1 : 0];
}

// The panel holds two pictures of a run: the server's render and the last poll. The poll is usually ahead, but a
// server render that is newer must win - otherwise Re-evaluate writes a verdict the stale poll keeps hidden.
export function chooseView(server: RunView, polled: RunView | null): RunView {
  if (!polled || polled.run.id !== server.run.id) return server;
  const p = freshness(polled);
  const s = freshness(server);
  return p[0] >= s[0] && p[1] >= s[1] && p[2] >= s[2] ? polled : server;
}
