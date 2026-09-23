/**
 * Where a web address could be carrying data out: the query string, the path, or the host name in front of the
 * site's own name. Code, and cheap, because it runs on every fetch: it only decides whether the url guard spends a
 * Jev call (about 300 ms) on the address. Each threshold was set from real addresses the agent fetches, pinned in
 * carried.test.ts: news slugs, GitHub paths, document ids and CDN hosts stay free; a file's worth of text does not.
 */

export type Carrier = "query" | "path" | "host";

export const QUERY_LIMIT = 80; // ?id=, ?q=, ?page= are short; rows of a CSV or a report are not
export const PATH_ENCODED_LIMIT = 64; // a git commit hash (40) or a Google Docs id (44) fits; base64 of a file does not
export const PATH_PUNCTUATION_LIMIT = 3; // commas, newlines, quotes, braces: the shape of CSV or JSON, not of a page name
export const PATH_LIMIT = 200; // the long news slug in the tests is 115: past 200 it is words strung together
export const HOST_ENCODED_LIMIT = 16; // a CloudFront name (14) fits; a hex-encoded line of a file does not

/**
 * How many characters of these tokens look encoded rather than written: letters mixed with digits (base64, hex,
 * base32 all are), or a run of digits longer than any id (a tweet's is 19). Words, years and short ids count nothing.
 */
function encodedLength(tokens: string[]): number {
  const encoded = tokens.filter((t) => /\d/.test(t) && (/[a-z]/i.test(t) || t.length >= 24));
  return encoded.reduce((sum, t) => sum + t.length, 0);
}

function decoded(path: string): string {
  try {
    return decodeURIComponent(path); // judged as written: a Japanese title is letters, not %E6%9D%B1 soup
  } catch {
    return path; // a malformed escape is judged as it stands
  }
}

function pathCarries(pathname: string): boolean {
  const path = decoded(pathname);
  if (path.length > PATH_LIMIT) return true;
  if ((path.match(/[,\n\r\t"{};|<>]/g) ?? []).length >= PATH_PUNCTUATION_LIMIT) return true;
  // Split where a slug or a file name breaks into words; base64 and hex have no such breaks, so they stay whole.
  return encodedLength(path.split(/[\s/\-_.~]+/)) > PATH_ENCODED_LIMIT;
}

function hostCarries(hostname: string): boolean {
  // Everything in front of the last two labels: "www" in www.nytimes.com. On a two-part suffix (bbc.co.uk) the
  // site's own name is counted too, which costs nothing: a name is words, not an encoding.
  const front = hostname.split(".").slice(0, -2);
  return encodedLength(front.flatMap((label) => label.split("-"))) >= HOST_ENCODED_LIMIT;
}

/** The first place, in this order, where the address has room for the task's data; null for an ordinary address. */
export function carriedIn(url: URL): Carrier | null {
  if (url.search.slice(1).length + url.hash.slice(1).length > QUERY_LIMIT) return "query"; // without the ? and #
  if (pathCarries(url.pathname)) return "path";
  if (hostCarries(url.hostname)) return "host";
  return null;
}
