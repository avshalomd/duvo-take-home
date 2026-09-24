import { describe, expect, it } from "vitest";
import { OAUTH_ERROR_FALLBACK, oauthErrorSentence } from "./oauth-error";

// Security QA: ?oauth_error=<text> used to be shown word for word in the app's own red toast, so a link could make
// the app say anything. The OAuth routes now send a code; this page says its own sentence for it.
describe("oauthErrorSentence", () => {
  it("says the page's own sentence for a code the sign-in routes send", () => {
    expect(oauthErrorSentence("cancelled")).toBe("The sign-in was cancelled");
    expect(oauthErrorSentence("expired")).toBe("This sign-in link has expired or was already used; start the sign-in again");
    expect(oauthErrorSentence("token_only")).toBe("This connection does not offer sign-in; add a token instead");
    expect(oauthErrorSentence("not_allowed")).toBe("Only an owner or an admin can sign a connection in");
  });

  // UX QA U29: one word for office workers on the Connections page, "connection", never "server"
  it("calls it a connection in every sentence", () => {
    const codes = [
      "not_allowed", "not_found", "cancelled", "refused", "incomplete", "other_browser", "expired", "unreachable", "unreadable",
      "no_sign_in_needed", "token_only", "other_server", "register_by_hand", "registration_refused", "unsupported", "token_refused",
      "failed", "start_failed",
    ];
    for (const code of codes) expect(oauthErrorSentence(code), code).not.toMatch(/server/i);
    expect(oauthErrorSentence("unreachable")).toBe("The connection could not be reached; check its address and try again");
  });

  it("says one general sentence for anything else, never the text it was given", () => {
    const planted = "Your workspace was suspended. Call +1 555 0100 to restore it";
    expect(oauthErrorSentence(planted)).toBe(OAUTH_ERROR_FALLBACK);
    expect(oauthErrorSentence("constructor")).toBe(OAUTH_ERROR_FALLBACK); // not a property every object has
    expect(OAUTH_ERROR_FALLBACK).toBe("The sign-in did not work; start it again");
  });

  it("says nothing when there is no error", () => {
    expect(oauthErrorSentence(undefined)).toBeUndefined();
  });
});
