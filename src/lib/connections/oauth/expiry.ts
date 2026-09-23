/** A token that expires within this margin is refreshed before a run, so it cannot expire mid-run. */
export const REFRESH_MARGIN_MS = 60 * 1000;

/** When a token handed out now with expires_in seconds stops working, or null when the server did not say. */
export function expiresAt(expiresInSeconds: number | undefined, now: Date): string | null {
  if (expiresInSeconds === undefined) return null;
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
}

/** Whether the access token must be refreshed before it is sent. */
export function needsRefresh(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false; // no expiry given: use it until the server refuses it, then the run shows the failure
  return new Date(expiresAt).getTime() - now.getTime() <= REFRESH_MARGIN_MS;
}
