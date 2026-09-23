import { randomBytes, timingSafeEqual } from "node:crypto";

/** How long a started sign-in waits for its callback. */
export const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * The state sent to the server and expected back at the callback: 32 random bytes, so it cannot be guessed.
 * It is random rather than signed because the connection row stores it: the callback finds the sign-in by it,
 * and clearing it after use is what makes it single use.
 */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/** Whether a callback's state matches the sign-in waiting on this connection, and is still fresh. */
export function checkState(
  pending: { state: string; createdAt: string } | null | undefined,
  given: string,
  now: Date,
): "ok" | "unknown" | "expired" {
  if (!pending || !pending.state || !sameString(pending.state, given)) return "unknown"; // no sign-in waiting: never started, or already used
  const age = now.getTime() - new Date(pending.createdAt).getTime();
  return age < STATE_TTL_MS ? "ok" : "expired";
}

/** Constant-time comparison, so the time taken does not tell a guesser how many characters were right. */
function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
