import { sessionFromHeaders } from "@/lib/auth/session";
import { fileResponse } from "@/lib/outputs/file-response";
import { getFile } from "@/lib/runs/queries";

export const runtime = "nodejs";

/**
 * The download route: the file the agent wrote. ?inline=1 shows a chart in the page; ?confirm=1 downloads a file the
 * output scan held back. What each case answers is decided in fileResponse, which is tested on its own.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return new Response("Sign in first", { status: 401 });
  // Next already decodes a dynamic segment: decoding again threw on "100%25.csv" and lost the space in "a b.csv".
  const { id, name } = await params;
  const file = await getFile(session.workspaceId, id, name); // the run must belong to the session's workspace
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, new URL(req.url).searchParams);
}
