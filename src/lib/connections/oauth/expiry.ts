/** A token that expires within this margin is refreshed before a run, so it cannot expire mid-run. */
export const REFRESH_MARGIN_MS = 60 * 1000;

/** When a token handed out now with expires_in seconds stops working, or null when the server did not say. */
export function expiresAt(_expiresInSeconds: number | undefined, _now: Date): string | null {
  throw new Error("not implemented: expiresAt");
}

/** Whether the access token must be refreshed before it is sent. */
export function needsRefresh(_expiresAt: string | null, _now: Date): boolean {
  throw new Error("not implemented: needsRefresh");
}
