import type { Run, RunEvent } from "@/contracts/run";

/** One server-sent message: the events the client has not seen, the run as it is now, and whether it is over. */
export type StreamMessage = { events: RunEvent[]; run: Run; done: boolean };

/** `?after=<seq>`: the last event the client already has. Anything that is not a whole number >= 0 means "none". */
export function parseAfter(value: string | null): number {
  throw new Error(`not implemented: parseAfter(${value})`);
}

/** The next message from a fresh read of the run, and the cursor to use for the one after it. */
export function nextMessage(snapshot: { run: Run; events: RunEvent[] }, after: number): { message: StreamMessage; after: number } {
  throw new Error(`not implemented: nextMessage(${snapshot.run.id}, ${after})`);
}

/** One SSE frame. JSON.stringify never emits a raw newline, so one `data:` line always holds the whole message. */
export function sseFrame(message: StreamMessage): string {
  throw new Error(`not implemented: sseFrame(${message.run.id})`);
}
