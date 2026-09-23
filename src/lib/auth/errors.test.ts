import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./errors";

describe("friendlyAuthError", () => {
  it("says a wrong email or password in plain words, without saying which one was wrong", () => {
    expect(friendlyAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })).toBe("That email and password do not match.");
  });

  it("points someone who already has an account to sign in", () => {
    const expected = "There is already an account with that email. Sign in instead.";
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
