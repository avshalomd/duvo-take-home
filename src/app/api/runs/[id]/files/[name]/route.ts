import { getFile } from "@/lib/runs/queries";

export const runtime = "nodejs";

/** The download route: the file the agent wrote, served as an attachment under its own name. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  const file = await getFile(id, decodeURIComponent(name));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.content, {
    headers: {
      "Content-Type": `${file.meta.mime}; charset=utf-8`,
      // quoted, and quotes stripped from the name: an unquoted name with a space breaks the header
      "Content-Disposition": `attachment; filename="${file.meta.name.replace(/"/g, "")}"`,
    },
  });
}
