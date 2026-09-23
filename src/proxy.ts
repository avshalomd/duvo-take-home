import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { needsSignIn, signInPath } from "@/lib/auth/paths";

/**
 * The sign-in gate in front of every page. It only looks for the session cookie (no database call), so a visitor
 * without one goes to /sign-in at once; whether the cookie is real is checked by requireSession() in the layout,
 * which redirects too. The rules for which paths are public live in lib/auth/paths.ts, where they are tested.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsSignIn(pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL(signInPath(pathname + search), request.url));
}

// A fast path only: Next skips the proxy for these without running it. needsSignIn() repeats the same rules,
// so a request that slips through the matcher is still judged correctly.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
