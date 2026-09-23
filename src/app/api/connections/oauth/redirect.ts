import { NextResponse } from "next/server";

/** The cookie that ties a sign-in to the browser that started it. */
export const STATE_COOKIE = "oauth_state";

/** Where the server sends the browser back after the sign-in. */
export function callbackUri(_req: Request): string {
  throw new Error("not implemented: callbackUri");
}

/** Back to the connections page with one message for the person. */
export function backToSettings(_req: Request, _params: Record<string, string>): NextResponse {
  throw new Error("not implemented: backToSettings");
}
