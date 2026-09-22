/**
 * The headers for one downloaded file. RFC 6266: `filename` is the ascii fallback for old clients and
 * `filename*` (RFC 5987) carries the real name, so `100%.csv`, `a b.csv` and a Cyrillic name all arrive intact.
 * A header value may only hold ascii - a non-Latin-1 character in it throws - hence the fallback below.
 */
export function downloadHeaders(name: string, mime: string): Record<string, string> {
  // quotes and backslashes would end the quoted string early; anything outside printable ascii becomes "_"
  const ascii = name.replace(/["\\]/g, "").replace(/[^\x20-\x7e]/g, "_") || "download";
  return {
    "Content-Type": `${mime}; charset=utf-8`,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff", // the agent names its own files: never let the browser sniff a type
  };
}
