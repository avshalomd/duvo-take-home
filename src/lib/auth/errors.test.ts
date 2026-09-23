import { describe, expect, it } from "vitest";
import { INVITE_ONLY, accountExists, friendlyAuthError, oauthErrorMessage } from "./errors";

describe("invite-only sign-up in words", () => {
  it("is one plain line naming the product and what to do", () => {
    expect(INVITE_ONLY).toBe("Handover is invite-only. Ask someone in a workspace to send you an invitation.");
  });

  it("on the sign-up form, points at the invited address when another email was typed", () => {
    expect(friendlyAuthError({ code: "SIGNUP_INVITE_ONLY", status: 403 })).toBe("There is no invitation for this email. Use the address your invitation was sent to.");
  });

  it("after Google, says the same line when Google would have made a new account without an invitation", () => {
    expect(oauthErrorMessage("SIGNUP_INVITE_ONLY")).toBe(INVITE_ONLY);
  });

  it("after Google, says a calm general line for any other failure, and nothing when there was none", () => {
    expect(oauthErrorMessage("unable_to_get_user_info")).toBe("Signing in with Google did not work. Try again, or use your email.");
    expect(oauthErrorMessage(undefined)).toBeNull();
  });
});

describe("accountExists", () => {
  it("is true for both of Better Auth's 'already exists' codes and false for anything else", () => {
    expect(accountExists({ code: "USER_ALREADY_EXISTS" })).toBe(true);
    expect(accountExists({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" })).toBe(true);
    expect(accountExists({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(false);
    expect(accountExists(null)).toBe(false);
  });
});

describe("friendlyAuthError", () => {
  it("says a wrong email or password in plain words, without saying which one was wrong", () => {
    expect(friendlyAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe("That email and password do not match.");
  });

  // Q110: the sentence says what happened; the form adds "Sign in instead" as a link with the email filled in.
  it("says an email already has an account, and leaves the way to sign in to the form's link", () => {
    const expected = "There is already an account with that email.";
    expect(friendlyAuthError({ code: "USER_ALREADY_EXISTS", status: 422 })).toBe(expected);
    expect(friendlyAuthError({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", status: 422 })).toBe(expected);
  });

  it("gives the password rule when the password is too short", () => {
    expect(friendlyAuthError({ code: "PASSWORD_TOO_SHORT", status: 400 })).toBe("Use at least 8 characters for the password.");
  });

  it("asks for a real email address when the email is malformed", () => {
    expect(friendlyAuthError({ code: "INVALID_EMAIL", status: 400 })).toBe("That does not look like an email address.");
  });

  it("asks to wait when there were too many tries", () => {
    expect(friendlyAuthError({ status: 429 })).toBe("Too many tries. Wait a minute, then try again.");
  });

  it("falls back to a calm general sentence for anything else", () => {
    expect(friendlyAuthError({ code: "SOMETHING_NEW", status: 500 })).toBe("Something went wrong. Try again in a moment.");
    expect(friendlyAuthError(null)).toBe("Something went wrong. Try again in a moment.");
  });
});
