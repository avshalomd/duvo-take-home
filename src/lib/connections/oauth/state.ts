/** How long a started sign-in waits for its callback. */
export const STATE_TTL_MS = 10 * 60 * 1000;

/** The state sent to the server and expected back at the callback. */
export function newState(): string {
  throw new Error("not implemented: newState");
}

/** Whether a callback's state matches the sign-in waiting on this connection, and is still fresh. */
export function checkState(
  _pending: { state: string; createdAt: string } | null | undefined,
  _given: string,
  _now: Date,
): "ok" | "unknown" | "expired" {
  throw new Error("not implemented: checkState");
}
