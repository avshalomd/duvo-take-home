import type { NextRequest, NextResponse } from "next/server";
import { completeOAuth } from "@/lib/connections/oauth";
import { SignInError } from "@/lib/connections/oauth/errors";
import { listConnections } from "@/lib/connections/store";
import { COOKIE_PATH, STATE_COOKIE, backToSettings, callbackUri, failedBack } from "../redirect";

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
    if (error === "access_denied") return failedBack(req, "cancelled");
    // The server's own words are anyone's to write (this address can be opened by hand): the log keeps them
    console.warn("[oauth] the server refused the sign-in", { error: error.slice(0, 100), description: (query.get("error_description") ?? "").slice(0, 300) });
    return failedBack(req, "refused");
  }
  const code = query.get("code");
  const state = query.get("state");
  if (!code || !state) return failedBack(req, "incomplete");
  if (req.cookies.get(STATE_COOKIE)?.value !== state) return failedBack(req, "other_browser");

  try {
    const { workspaceId, connectionId } = await completeOAuth({ code, state, redirectUri: callbackUri(req) });
    const name = (await listConnections(workspaceId)).find((c) => c.id === connectionId)?.name ?? "the connection"; // shown in the toast: the one word for it (UX QA U29)
    return backToSettings(req, { signed_in: name });
  } catch (e) {
    if (e instanceof SignInError) {
      console.warn("[oauth] sign-in failed:", e.message); // the full account, the server's words included
      return failedBack(req, e.code);
    }
    console.error("[oauth] callback failed", e); // the details go to the server log; the person gets a sentence
    return failedBack(req, "failed");
  }
}
