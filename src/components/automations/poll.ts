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

export function parseRunPayload(json: unknown): RunView | null {
  const parsed = Payload.safeParse(json);
  if (!parsed.success) return null; // a 404 or a changed payload keeps the last good view instead of blanking it
  return parsed.data;
}
