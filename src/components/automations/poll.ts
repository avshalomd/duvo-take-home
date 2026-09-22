import { z } from "zod";
import { Verdict } from "@/contracts/eval";
import { FileMeta, Run, RunEvent, RunState } from "@/contracts/run";
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

export function shouldPoll(status: string): boolean {
  return status === "queued" || status === "running" || status === "evaluating";
}

// A run that has settled. The panel polls until then; the runs list beside it is a server render, so reaching
// this is also the moment to ask the server for a fresh page (Q79: the row said "Working on it" until a reload).
export function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed";
}

export function parseRunPayload(json: unknown): RunView | null {
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return null; // a 404 or a changed payload keeps the last good view instead of blanking it
  return parsed.data;
}

// How far along a view is: more events, or a newer verdict, means it is the later picture of the run.
function freshness(view: RunView): [number, string] {
  return [view.events.length, view.verdict?.evaluatedAt ?? ""];
}

// The panel holds two pictures of a run: the server's render and the last poll. The poll is usually ahead, but a
// server render that is newer must win - otherwise Re-evaluate writes a verdict the stale poll keeps hidden.
export function chooseView(server: RunView, polled: RunView | null): RunView {
  if (!polled || polled.run.id !== server.run.id) return server;
  const [polledEvents, polledAt] = freshness(polled);
  const [serverEvents, serverAt] = freshness(server);
  return polledEvents >= serverEvents && polledAt >= serverAt ? polled : server;
}
