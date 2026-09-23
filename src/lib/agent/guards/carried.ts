export type Carrier = "query" | "path" | "host";
export const QUERY_LIMIT = 80;
export function carriedIn(_url: URL): Carrier | null {
  return null; // skeleton
}
