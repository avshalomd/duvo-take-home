import { downloadHeaders } from "@/lib/runs/download-headers";
import { sessionFromHeaders } from "@/lib/auth/session";
import { getFile } from "@/lib/runs/queries";

export const runtime = "nodejs";

/** The download route: the file the agent wrote, served as an attachment under its own name. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return new Response("Sign in first", { status: 401 });
  // Next already decodes a dynamic segment: decoding again threw on "100%25.csv" and lost the space in "a b.csv".
  const { id, name } = await params;
  const file = await getFile(session.workspaceId, id, name);
  if (!file) return new Response("Not found", { status: 404 });
  const body = file.meta.encoding === "base64" ? Buffer.from(file.content, "base64") : file.content; // STUB: quarantine confirm (outputs package)
  return new Response(body, { headers: downloadHeaders(file.meta.name, file.meta.mime) });
}
