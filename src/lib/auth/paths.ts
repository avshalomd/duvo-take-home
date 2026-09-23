// Pure path rules for the sign-in gate (src/proxy.ts) and the sign-in pages. No Next or Better Auth imports,
// so they are tested as plain functions.

const PUBLIC_PAGES = ["/sign-in", "/sign-up"];

// A path segment or its start: "/invite" matches "/invite/abc" but not "/invitees".
const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** True for every page that needs a signed-in user; false for the sign-in pages, the API and static files. */
export function needsSignIn(pathname: string): boolean {
  if (PUBLIC_PAGES.includes(pathname)) return false;
  if (under(pathname, "/invite")) return false; // the invitation page explains itself before asking to sign in
  // The API is left to the routes: each calls sessionFromHeaders and answers 401 JSON, which a fetch or a poll can
  // read, where a redirect would hand it the HTML of the sign-in page. /api/auth, /api/health and /api/cron are
  // public or guarded by their own secret anyway.
  if (under(pathname, "/api")) return false;
  if (under(pathname, "/_next")) return false;
  if (/\.[a-z0-9]+$/i.test(pathname)) return false; // a file: favicon.ico, robots.txt, an image in public/
  return true;
}

/** The sign-in page, carrying the page that was asked for so sign-in can return there. */
export function signInPath(requested: string): string {
  if (requested === "/") return "/sign-in"; // home is where sign-in goes anyway
  return `/sign-in?next=${encodeURIComponent(requested)}`;
}

/** Where to go after signing in: a path inside this app, never another site and never back to sign-in. */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/"; // a browser reads both as another host
  const pathname = next.split(/[?#]/)[0];
  if (PUBLIC_PAGES.includes(pathname)) return "/"; // sign-in -> sign-in would loop
  return next;
}
