import type { FileMeta } from "@/contracts/run";
import { downloadHeaders, inlineSvgHeaders } from "@/lib/runs/download-headers";

/** Why a file was held back, in one plain sentence, from what the output scan found. */
function heldBack(meta: FileMeta): string {
  const found = (meta.flags ?? []).filter((f) => f.kind === "credential").map((f) => f.detail);
  const why = found.length ? `it looks like it contains a password or key (${found.join("; ")})` : "the safety check flagged it";
  return `${meta.name} was held back because ${why}. Download it only if you are sure it is safe to keep.`;
}

/**
 * The response for one stored file, after the route has checked the session and the workspace:
 * - a quarantined file answers 409 with the reason until the person confirms (?confirm=1);
 * - an .svg asked for with ?inline=1 is served as an image for an <img> preview, under a no-script policy;
 * - everything else is an attachment under its own name, as in v1.
 */
export function fileResponse(file: { meta: FileMeta; content: string }, search: URLSearchParams): Response {
  const { meta, content } = file;
  if (meta.quarantined && search.get("confirm") !== "1") {
    // 409: the request conflicts with the file's state; the body is the sentence the UI or the browser shows
    return new Response(heldBack(meta), { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const body = meta.encoding === "base64" ? Buffer.from(content, "base64") : content; // an .xlsx is stored as base64 text
  // Only an SVG may be inline: any other type opened in the tab could be rendered as a page.
  if (search.get("inline") === "1" && meta.mime === "image/svg+xml") return new Response(body, { headers: inlineSvgHeaders(meta.name) });
  return new Response(body, { headers: downloadHeaders(meta.name, meta.mime) });
}
