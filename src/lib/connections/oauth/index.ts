import "server-only";
import type { AuthHeaders, CompleteOAuth, StartOAuth } from "@/contracts/connection";

export const startOAuth: StartOAuth = async () => {
  throw new Error("not implemented: startOAuth"); // STUB: the oauth package
};
export const completeOAuth: CompleteOAuth = async () => {
  throw new Error("not implemented: completeOAuth"); // STUB
};
/** A bearer token as v1 did; the oauth package adds OAuth access tokens, refreshed when expired. */
export const authHeaders: AuthHeaders = async (c) => (c.token ? { Authorization: `Bearer ${c.token}` } : undefined); // STUB
