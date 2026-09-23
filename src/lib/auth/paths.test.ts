import { describe, expect, it } from "vitest";
import { needsSignIn, safeNext, signInPath, withNext } from "./paths";

describe("needsSignIn", () => {
  it("gates every page of the app", () => {
    for (const path of ["/", "/automations", "/automations/abc", "/settings", "/settings/connections"]) {
      expect(needsSignIn(path), path).toBe(true);
    }
  });

  it("leaves the sign-in, sign-up and invitation pages public", () => {
    for (const path of ["/sign-in", "/sign-up", "/invite/abc123"]) {
      expect(needsSignIn(path), path).toBe(false);
    }
  });

  it("leaves every /api route to answer for itself, with a 401 instead of a redirect", () => {
    for (const path of ["/api/runs", "/api/runs/abc", "/api/auth/get-session", "/api/health", "/api/cron/tick"]) {
      expect(needsSignIn(path), path).toBe(false);
    }
  });

  it("leaves Next's own assets and static files public", () => {
    for (const path of ["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico", "/logo.svg", "/robots.txt"]) {
      expect(needsSignIn(path), path).toBe(false);
    }
  });

  it("does not mistake a page whose name starts like a public one for it", () => {
    expect(needsSignIn("/sign-in-help")).toBe(true);
    expect(needsSignIn("/apis")).toBe(true);
  });
});

describe("signInPath", () => {
  it("keeps the requested page and its query as ?next= so sign-in returns there", () => {
    expect(signInPath("/?run=123")).toBe("/sign-in?next=%2F%3Frun%3D123");
    expect(signInPath("/settings/members")).toBe("/sign-in?next=%2Fsettings%2Fmembers");
  });

  it("sends a visit to the bare home page to /sign-in without a next", () => {
    expect(signInPath("/")).toBe("/sign-in");
  });
});

describe("withNext", () => {
  it("carries the page to return to from sign-in to sign-up and back", () => {
    expect(withNext("/sign-up", "/invite/abc")).toBe("/sign-up?next=%2Finvite%2Fabc");
    expect(withNext("/sign-in", "/automations")).toBe("/sign-in?next=%2Fautomations");
  });

  it("leaves the link bare when the page to return to is home", () => {
    expect(withNext("/sign-up", "/")).toBe("/sign-up");
  });
});

describe("safeNext", () => {
  it("accepts a path inside the app", () => {
    expect(safeNext("/automations")).toBe("/automations");
    expect(safeNext("/?run=123")).toBe("/?run=123");
    expect(safeNext("/invite/abc")).toBe("/invite/abc");
  });

  it("answers home for a missing or empty next", () => {
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });

  it("refuses another site, so the sign-in page cannot be used as an open redirect", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  // Q86: ?next=/%09/evil.example arrives decoded as "/\t/evil.example"; a browser strips the tab and reads "//evil.example".
  it("refuses another site hidden behind a tab, a newline or a backslash that the browser would strip or flip", () => {
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("/\n/evil.example")).toBe("/");
    expect(safeNext("/\r\n/evil.example")).toBe("/");
    expect(safeNext("/\t\\evil.example")).toBe("/");
    expect(safeNext("/\\/evil.example")).toBe("/");
    expect(safeNext("/\\\\evil.example")).toBe("/");
  });

  it("refuses any control character, even where it would not change the host", () => {
    expect(safeNext("/automations\u0000")).toBe("/");
    expect(safeNext("/auto\tmations")).toBe("/");
  });

  it("answers home, not an error, for an address the URL parser cannot read", () => {
    expect(safeNext("//[")).toBe("/");
  });

  it("keeps the query and the fragment of a path it accepts", () => {
    expect(safeNext("/automations?tab=mine#top")).toBe("/automations?tab=mine#top");
  });

  it("refuses the sign-in and sign-up pages themselves, which would loop", () => {
    expect(safeNext("/sign-in")).toBe("/");
    expect(safeNext("/sign-up?next=/")).toBe("/");
  });
});
