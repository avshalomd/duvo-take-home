import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  throw new Error("not implemented: GET /api/connections/oauth/start");
}
