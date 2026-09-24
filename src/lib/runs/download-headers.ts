/**
 * The Content-Disposition for a file. RFC 6266: `filename` is the ascii fallback for old clients and `filename*`
 * (RFC 5987) carries the real name, so `100%.csv`, `a b.csv` and a Cyrillic name all arrive intact.
 * A header value may only hold ascii - a non-Latin-1 character in it throws - hence the fallback below.
 */
function disposition(kind: "attachment" | "inline", name: string): string {
  // quotes and backslashes would end the quoted string early; anything outside printable ascii becomes "_"
  const ascii = name.replace(/["\\]/g, "").replace(/[^\x20-\x7e]/g, "_") || "download";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Text is text/* and the XML types (image/svg+xml); everything else (an .xlsx) is bytes, and a charset on bytes is wrong.
const isText = (mime: string) => mime.startsWith("text/") || mime.endsWith("+xml");

/** The headers for one downloaded file: always an attachment under its own name. */
export function downloadHeaders(name: string, mime: string): Record<string, string> {
  return {
    "Content-Type": isText(mime) ? `${mime}; charset=utf-8` : mime, // Q125
    "Content-Disposition": disposition("attachment", name),
    "X-Content-Type-Options": "nosniff", // the agent names its own files: never let the browser sniff a type
  };
}

/**
 * The headers for a chart shown in the page (an <img> preview). A chart drawn from a spec carries no script, but an
 * SVG opened on its own is a document that could: the policy makes "nothing runs, nothing loads" a guarantee
 * rather than a property of how the file was made. Inline styles stay allowed because the chart uses them.
 */
export function inlineSvgHeaders(name: string): Record<string, string> {
  return {
    "Content-Type": "image/svg+xml",
    "Content-Disposition": disposition("inline", name), // "Save image as" keeps the chart's name
    "X-Content-Type-Options": "nosniff",
    // frame-ancestors here too: the app's own policy is left off this route so it cannot replace this one (F8)
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
  };
}
