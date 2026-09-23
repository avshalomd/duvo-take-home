import { describe, expect, it } from "vitest";
import { INVITATION_COOKIE, INVITATION_COOKIE_PATH, invitationCookie, invitationIdFromCookies } from "./invitation-cookie";

// Invite-only sign-up needs proof that the person opened the invitation's link, not only its email: the invitation
// page leaves the id in a cookie, and the sign-up (the form's request or Google's callback) reads it back.
describe("the invitation cookie", () => {
  it("lasts as long as an invitation can stay open, and is sent to the auth routes only, never read by scripts", () => {
    const cookie = invitationCookie("abc123", true);
    expect(cookie).toMatchObject({ name: INVITATION_COOKIE, value: "abc123", httpOnly: true, secure: true, sameSite: "lax", path: "/api/auth" });
    expect(cookie.maxAge).toBe(48 * 60 * 60); // as long as the invitation itself can stay open
    expect(INVITATION_COOKIE_PATH).toBe("/api/auth");
  });

  it("is not marked secure on a plain-http development server, where the browser would drop it", () => {
    expect(invitationCookie("abc123", false).secure).toBe(false);
  });

  it("reads the invitation id back from a Cookie header among other cookies", () => {
    expect(invitationIdFromCookies(`better-auth.session_token=x.y; ${INVITATION_COOKIE}=inv_42-A; theme=dark`)).toBe("inv_42-A");
  });

  it("reads nothing when there is no header, no such cookie, or an empty one", () => {
    expect(invitationIdFromCookies(null)).toBeNull();
    expect(invitationIdFromCookies(undefined)).toBeNull();
    expect(invitationIdFromCookies("theme=dark")).toBeNull();
    expect(invitationIdFromCookies(`${INVITATION_COOKIE}=`)).toBeNull();
  });

  it("ignores a value that is not the shape of an invitation id, so junk never reaches a query", () => {
    expect(invitationIdFromCookies(`${INVITATION_COOKIE}=${encodeURIComponent("x' or 1=1")}`)).toBeNull();
    expect(invitationIdFromCookies(`${INVITATION_COOKIE}=${"a".repeat(101)}`)).toBeNull();
  });

  it("does not mistake a cookie whose name only ends the same way for it", () => {
    expect(invitationIdFromCookies(`x${INVITATION_COOKIE}=abc`)).toBeNull();
  });
});
