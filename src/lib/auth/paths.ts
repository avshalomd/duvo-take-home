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

/**
 * The request header the proxy writes the requested page into (path and query). A cookie the proxy lets through
 * can still be stale, and then requireSession() redirects from inside a page, where the URL is not otherwise known.
 */
export const NEXT_PATH_HEADER = "x-requested-path";

/** The page the proxy recorded, made safe: a client could send the header itself, so it goes through safeNext. */
export function requestedPath(headers: Headers): string {
  return safeNext(headers.get(NEXT_PATH_HEADER) ?? undefined);
}

/** The invitation's id when `next` is an invitation page ("/invite/<id>"), else null. */
export function invitationIdFrom(next: string): string | null {
  const match = /^\/invite\/([^/?#]+)(?:[?#].*)?$/.exec(next);
  return match ? match[1] : null;
}

/** A sign-in or sign-up link that returns to `next` afterwards, and optionally fills in an email. */
export function withNext(page: "/sign-in" | "/sign-up", next: string, email?: string): string {
  const params = new URLSearchParams();
  if (next !== "/") params.set("next", next); // home is where signing in goes anyway
  if (email) params.set("email", email);
  const query = params.toString();
  return query ? `${page}?${query}` : page;
}

/** The sign-in page, carrying the page that was asked for (path and query) so sign-in can return there. */
export function signInPath(requested: string): string {
  return withNext("/sign-in", requested);
}

// A placeholder origin to resolve against: whatever `next` says, it is only safe if it stays on this origin.
const HERE = "http://here.invalid";

/** Where to go after signing in: a path inside this app, never another site and never back to sign-in. */
export function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // Browsers drop tabs and newlines from a URL and read "\" as "/", so "/\t/evil.example" is "//evil.example" to
  // them. Rather than list the tricks, refuse control characters and let the URL parser (which applies the same
  // rules) say where the address really goes.
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, HERE);
  } catch {
    return "/"; // "//[" and the like: unreadable, so not a place to send anyone
  }
  if (url.origin !== HERE) return "/";
  if (PUBLIC_PAGES.includes(url.pathname)) return "/"; // sign-in -> sign-in would loop
  return url.pathname + url.search + url.hash;
}
