import { tokenBucket, type Bucket } from "./rate-limit";

/**
 * Who may start a run. The app has no accounts (QA Q48), so an anonymous visitor could otherwise start runs until
 * the model budget was gone: two limits, both decided here so the Server Action and the route handler share them.
 */
export const MAX_IN_FLIGHT = 3; // agent runs are minutes long and cost up to $1 each
export const IN_FLIGHT_STATUSES = ["queued", "running", "evaluating"] as const;
export const STARTS_PER_IP = 5;
export const STARTS_WINDOW_MS = 10 * 60_000;

export const IN_FLIGHT_MESSAGE = "Three runs are already in progress - try again in a minute";
export const RATE_LIMIT_MESSAGE = "Too many runs from this address - try again later";

/** The process-wide bucket. Per instance, and that is the point: it needs no table and no round trip. */
export const startsByIp = tokenBucket(STARTS_PER_IP, STARTS_WINDOW_MS);

/** A readable reason to refuse the start, or null to let it through. The clock and the count are passed in. */
export function startBlockReason(args: { inFlight: number; ip: string; now: number; bucket: Bucket }): string | null {
  // The global cap is checked first so a visitor refused because someone else filled the queue keeps their tokens.
  if (args.inFlight >= MAX_IN_FLIGHT) return IN_FLIGHT_MESSAGE;
  if (!args.bucket.take(args.ip, args.now)) return RATE_LIMIT_MESSAGE;
  return null;
}

/** Thrown by startRun when a limit refuses the start: the route answers 429, the action shows the message. */
export class RunLimitError extends Error {}
