import type { Run, RunEvent } from "@/contracts/run";
import { isFinished } from "@/lib/runner/status";

/** One server-sent message: the events the client has not seen, the run as it is now, and whether it is over. */
export type StreamMessage = { events: RunEvent[]; run: Run; done: boolean };

/** `?after=<seq>`: the last event the client already has. Anything that is not a whole number >= 0 means "none". */
export function parseAfter(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 0; // digits only: "1e3" and "2.5" are numbers to JS, not to us
  return Number(value);
}

/** The next message from a fresh read of the run, and the cursor to use for the one after it. */
export function nextMessage(snapshot: { run: Run; events: RunEvent[] }, after: number): { message: StreamMessage; after: number } {
  const events = snapshot.events.filter((e) => e.seq > after);
  // The run is sent every time, new events or not: a status change (running -> evaluating) has no event of its own.
  const message = { events, run: snapshot.run, done: isFinished(snapshot.run.status) };
  return { message, after: events.length ? Math.max(...events.map((e) => e.seq)) : after };
}

/** One SSE frame. JSON.stringify never emits a raw newline, so one `data:` line always holds the whole message. */
export function sseFrame(message: StreamMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}
