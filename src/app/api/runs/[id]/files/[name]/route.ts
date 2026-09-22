import { downloadHeaders } from "@/lib/runs/download-headers";
import { getFile } from "@/lib/runs/queries";

export const runtime = "nodejs";

/** The download route: the file the agent wrote, served as an attachment under its own name. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  // Next already decodes a dynamic segment: decoding again threw on "100%25.csv" and lost the space in "a b.csv".
  const { id, name } = await params;
  const file = await getFile(id, name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.content, { headers: downloadHeaders(file.meta.name, file.meta.mime) });
}
