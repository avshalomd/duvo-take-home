/** Not implemented yet: the tests in limits.test.ts come first. */
import type { Bucket } from "./rate-limit";

export const MAX_IN_FLIGHT = 3;
export const IN_FLIGHT_MESSAGE = "";
export const RATE_LIMIT_MESSAGE = "";

export function startBlockReason(args: { inFlight: number; ip: string; now: number; bucket: Bucket }): string | null {
  void args;
  return null;
}
