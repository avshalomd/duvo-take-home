import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_PATH_HEADER, needsSignIn, signInPath } from "@/lib/auth/paths";

/**
 * The sign-in gate in front of every page. It only looks for the session cookie (no database call), so a visitor
 * without one goes to /sign-in at once; whether the cookie is real is checked by requireSession() in the layout,
 * which redirects too. The rules for which paths are public live in lib/auth/paths.ts, where they are tested.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsSignIn(pathname)) return NextResponse.next();
  if (!getSessionCookie(request)) return NextResponse.redirect(new URL(signInPath(pathname + search), request.url));

  // The cookie may still be stale or forged. Tell the page which address was asked for, so requireSession() can
  // send the visitor to sign-in with it as ?next= (Q130). Set on every page request: a value the browser sent
  // in this header is overwritten, never trusted.
  const forwarded = new Headers(request.headers);
  forwarded.set(NEXT_PATH_HEADER, pathname + search);
  return NextResponse.next({ request: { headers: forwarded } });
}

// A fast path only: Next skips the proxy for these without running it. needsSignIn() repeats the same rules,
// so a request that slips through the matcher is still judged correctly.
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
