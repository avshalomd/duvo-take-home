import { neonConfig } from "@neondatabase/serverless";

/**
 * How many requests `fn` makes to the database over Neon's HTTP driver (the default `db`): each one is a round trip,
 * and on a page render the round trips one after another are what the reader waits for. A db.batch is one request.
 * The driver reads neonConfig.fetchFunction at each query, so swapping it here counts every query `fn` makes.
 */
export async function countDbRequests<T>(fn: () => Promise<T>): Promise<{ result: T; requests: number }> {
  const before = neonConfig.fetchFunction;
  let requests = 0;
  neonConfig.fetchFunction = (input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    return fetch(input, init);
  };
  try {
    const result = await fn();
    return { result, requests };
  } finally {
    neonConfig.fetchFunction = before;
  }
}
