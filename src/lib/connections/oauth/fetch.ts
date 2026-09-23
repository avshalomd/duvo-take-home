import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

/** Wraps a fetch so it only reaches public hosts. */
export function guardedFetch(_base: FetchLike): FetchLike {
  throw new Error("not implemented: guardedFetch");
}

export const publicFetch: FetchLike = (url, init) => guardedFetch(fetch)(url, init);
