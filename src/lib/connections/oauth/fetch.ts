import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { publicHttpUrl } from "@/contracts/connection";

const TIMEOUT_MS = 10_000; // one slow metadata document must not hang the person's click on "Sign in"
export const MAX_REDIRECTS = 3; // enough for http -> https and a trailing slash; a longer chain is a loop or a trick

/**
 * Wraps a fetch so it only reaches public hosts. The addresses the sign-in fetches come from a remote server
 * (its metadata names the authorization server and its endpoints), so each one gets the same check as a
 * connection's own URL: otherwise a hostile server could point our server at our own network (QA Q46).
 * Redirects are followed here, not by fetch, so every Location passes the same check first (QA Q83).
 */
export function guardedFetch(base: FetchLike): FetchLike {
  return async (url, init) => {
    const first = String(url);
    if (!isPublic(first)) throw new Error(`Refused to fetch ${hostOf(first)}: it is on a private or local network, or not http(s)`);
    const signal = init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS); // one budget for the whole chain

    let target = first;
    let request: RequestInit = { ...init, signal, redirect: "manual" };
    for (let hop = 0; ; hop++) {
      const res = await base(target, request);
      const location = isRedirect(res.status) ? res.headers.get("location") : null;
      if (!location) return res;
      await res.body?.cancel(); // only the Location was needed
      if (hop === MAX_REDIRECTS) throw new Error(`Refused to follow more than ${MAX_REDIRECTS} redirects from ${hostOf(first)}`);

      const next = new URL(location, target).href; // a Location may be relative to the address that sent it
      if (!isPublic(next)) throw new Error(`Refused to follow a redirect to ${hostOf(next)}: it is on a private or local network, or not http(s)`);
      request = nextRequest(request, res.status, new URL(target).origin !== new URL(next).origin);
      target = next;
    }
  };
}

const isPublic = (url: string) => publicHttpUrl.safeParse(url).success;
const isRedirect = (status: number) => [301, 302, 303, 307, 308].includes(status);

/** The request for the next hop, with fetch's own rules: 307/308 repeat it as it was; 301/302/303 after a POST become a GET without the body. */
function nextRequest(request: RequestInit, status: number, crossOrigin: boolean): RequestInit {
  const method = (request.method ?? "GET").toUpperCase();
  const keepsBody = status === 307 || status === 308 || method === "GET" || method === "HEAD";
  const headers = new Headers(request.headers);
  if (crossOrigin) headers.delete("authorization"); // a client secret in Basic auth is for the server we asked, not the one it points to
  if (keepsBody) return { ...request, headers };
  headers.delete("content-type");
  return { ...request, method: "GET", body: undefined, headers };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "an invalid address";
  }
}

export const publicFetch: FetchLike = guardedFetch((url, init) => fetch(url, init));
