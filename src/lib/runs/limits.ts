import { tokenBucket, type Bucket } from "./rate-limit";

/**
 * Who may start a run, beyond the workspace's own limits (lib/usage/budget.ts): two limits for the whole deployment,
 * both decided here so the Server Action and the route handler share them.
 */
// Anyone can make an account and workspaces, each with limits of its own, and every run spends the operator's model
// key (security QA): so the deployment keeps a cap of its own across all workspaces. Six leaves room for two
// workspaces running their default three at once; agent runs are minutes long and cost up to $1 each.
export const MAX_IN_FLIGHT = 6;
export const IN_FLIGHT_STATUSES = ["queued", "running", "evaluating"] as const;
export const STARTS_PER_IP = 5;
export const STARTS_WINDOW_MS = 10 * 60_000;

export const IN_FLIGHT_MESSAGE = "Handover is busy with other runs right now - try again in a minute";
export const RATE_LIMIT_MESSAGE = "Too many runs from this address - try again later";

/** The process-wide bucket. Per instance, and that is the point: it needs no table and no round trip. */
export const startsByIp = tokenBucket(STARTS_PER_IP, STARTS_WINDOW_MS);

/**
 * A readable reason to refuse the start, or null to let it through. `inFlight` is the deployment's count, across
 * every workspace; `ip` is null for a scheduled start, which has no caller to brake but meets the cap all the same.
 */
export function startBlockReason(args: { inFlight: number; ip: string | null; now: number; bucket: Bucket }): string | null {
  // The deployment's cap is checked first so a visitor refused because others filled it keeps their tokens.
  if (args.inFlight >= MAX_IN_FLIGHT) return IN_FLIGHT_MESSAGE;
  if (args.ip !== null && !args.bucket.take(args.ip, args.now)) return RATE_LIMIT_MESSAGE;
  return null;
}

/** Thrown by startRun when a limit refuses the start: the route answers 429, the action shows the message. */
export class RunLimitError extends Error {}
