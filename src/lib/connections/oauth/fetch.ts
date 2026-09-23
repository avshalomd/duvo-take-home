import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { publicHttpUrl } from "@/contracts/connection";

const TIMEOUT_MS = 10_000; // one slow metadata document must not hang the person's click on "Sign in"

/**
 * Wraps a fetch so it only reaches public hosts. The addresses the sign-in fetches come from a remote server
 * (its metadata names the authorization server and its endpoints), so each one gets the same check as a
 * connection's own URL: otherwise a hostile server could point our server at our own network (QA Q46).
 */
export function guardedFetch(base: FetchLike): FetchLike {
  return async (url, init) => {
    const checked = publicHttpUrl.safeParse(String(url));
    if (!checked.success) throw new Error(`Refused to fetch ${hostOf(url)}: it is on a private or local network, or not http(s)`);
    const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
    return base(url, { ...init, signal });
  };
}

function hostOf(url: string | URL): string {
  try {
    return new URL(String(url)).host;
  } catch {
    return "an invalid address";
  }
}

export const publicFetch: FetchLike =guardedFetch((url, init) => fetch(url, init));
