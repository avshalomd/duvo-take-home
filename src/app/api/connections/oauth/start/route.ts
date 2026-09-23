import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canChangeSettings } from "@/lib/auth/roles";
import { sessionFromHeaders } from "@/lib/auth/session";
import { startOAuth } from "@/lib/connections/oauth";
import { SignInError } from "@/lib/connections/oauth/errors";
import { STATE_TTL_MS } from "@/lib/connections/oauth/state";
import { COOKIE_PATH, STATE_COOKIE, backToSettings, callbackUri } from "../redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The settings page's "Sign in" link: ?id=<connectionId> -> 302 to the server's own sign-in page. */
export async function GET(req: NextRequest): Promise<Response> {
  const session = await sessionFromHeaders(req.headers);
  if (!session) return Response.json({ error: "sign in first" }, { status: 401 });
  // The same rule as the settings actions: the page hides the button from members, but anyone can open this link.
  if (!canChangeSettings(session.role)) return backToSettings(req, { oauth_error: "Only an owner or an admin can sign a connection in" });
  const id = z.uuid().safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return backToSettings(req, { oauth_error: "That connection was not found" });

  try {
    // The workspace comes from the session, so a connection id from another workspace is simply not found.
    const { authorizeUrl } = await startOAuth(session.workspaceId, id.data, callbackUri(req));
    const res = NextResponse.redirect(authorizeUrl, 302);
    res.cookies.set(STATE_COOKIE, new URL(authorizeUrl).searchParams.get("state") ?? "", {
      httpOnly: true,
      sameSite: "lax", // "lax" is still sent on the server's redirect back, which is a top-level GET
      secure: req.nextUrl.protocol === "https:",
      path: COOKIE_PATH,
      maxAge: STATE_TTL_MS / 1000,
    });
    return res;
  } catch (e) {
    if (e instanceof SignInError) return backToSettings(req, { oauth_error: e.message });
    console.error("[oauth] start failed", e);
    return backToSettings(req, { oauth_error: "The sign-in could not start; try again" });
  }
}
