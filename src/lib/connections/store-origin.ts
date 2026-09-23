/**
 * Whether two addresses are the same server: the same scheme, host and port, which is what a URL's origin is. A saved
 * token or sign-in was given for one server, so it may follow an edit of the address only within that server (Q80).
 * This file has no server imports, so the edit dialog can warn with the very rule the store applies.
 */
export function sameServer(before: string, after: string): boolean {
  try {
    return new URL(before).origin === new URL(after).origin; // origin lower-cases the host and drops a default port
  } catch {
    return false; // an address that cannot be read counts as another server: in doubt, the credentials are dropped
  }
}
