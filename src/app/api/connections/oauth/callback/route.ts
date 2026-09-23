import type { NextRequest, NextResponse } from "next/server";
import { completeOAuth } from "@/lib/connections/oauth";
import { SignInError } from "@/lib/connections/oauth/errors";
import { listConnections } from "@/lib/connections/store";
import { COOKIE_PATH, STATE_COOKIE, backToSettings, callbackUri } from "../redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The server sends the browser back here with ?code&state, or ?error. Every outcome lands on the connections page. */
export async function GET(req: NextRequest): Promise<Response> {
  const res = await land(req);
  res.cookies.set(STATE_COOKIE, "", { path: COOKIE_PATH, maxAge: 0 }); // used or not, this browser's sign-in is over
  return res;
}

async function land(req: NextRequest): Promise<NextResponse> {
  const query = req.nextUrl.searchParams;
  const error = query.get("error");
  if (error) {
    const reason = (query.get("error_description") || error).slice(0, 160);
    return backToSettings(req, { oauth_error: error === "access_denied" ? "The sign-in was cancelled" : `The server refused the sign-in: ${reason}` });
  }
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return backToSettings(req, { oauth_error: "The sign-in came back incomplete; start it again" });
  if (req.cookies.get(STATE_COOKIE)?.value !== state) {
    return backToSettings(req, { oauth_error: "This sign-in was not started in this browser, or it took too long; start it again" });
  }

  try {
    const { workspaceId, connectionId } = await completeOAuth({ code, state, redirectUri: callbackUri(req) });
    const name = (await listConnections(workspaceId)).find((c) => c.id === connectionId)?.name ?? "the server";
    return backToSettings(req, { signed_in: name });
  } catch (e) {
    if (e instanceof SignInError) return backToSettings(req, { oauth_error: e.message });
    console.error("[oauth] callback failed", e); // the details go to the server log; the person gets a sentence
    return backToSettings(req, { oauth_error: "The sign-in failed; start it again" });
  }
}
