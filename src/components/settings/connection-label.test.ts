import { describe, expect, it } from "vitest";
import { asSentence, connectionState, connectionStatus, signInWords, toolCount, toolWords } from "./connection-label";

describe("connectionStatus", () => {
  it("shows a connection the last run reached as connected", () => {
    expect(connectionStatus("connected")).toEqual({ label: "connected", tone: "ok" });
  });

  it("shows a connection no run has used yet as 'never used', not as an error", () => {
    expect(connectionStatus(null)).toEqual({ label: "never used", tone: "idle" });
  });

  it("says what to do about a server with no credentials, rather than the store's own enum", () => {
    const needsToken = { label: "needs a token before a run can use it", tone: "warn" };
    expect(connectionStatus("not_configured")).toEqual(needsToken);
    expect(connectionStatus("needs-auth")).toEqual(needsToken);
  });

  it("keeps the server's own words when it failed, because the reason is the useful part", () => {
    expect(connectionStatus("failed: 401 Unauthorized")).toEqual({ label: "failed: 401 Unauthorized", tone: "bad" });
  });
});

describe("connectionState, what the Connections list says beside a server", () => {
  const c = (over: Partial<Parameters<typeof connectionState>[0]>) => ({
    authType: "none" as const,
    hasToken: false,
    signedIn: undefined,
    lastStatus: "connected",
    ...over,
  });

  it("asks for a sign-in before anything else when an OAuth server is not signed in", () => {
    expect(connectionState(c({ authType: "oauth", signedIn: false, lastStatus: null }))).toEqual({
      label: "needs you to sign in",
      tone: "warn",
    });
  });

  it("asks for a token when a token server has none saved", () => {
    expect(connectionState(c({ authType: "bearer", hasToken: false, lastStatus: null }))).toEqual({
      label: "needs a token before a run can use it",
      tone: "warn",
    });
  });

  it("otherwise says what the last run saw", () => {
    expect(connectionState(c({ authType: "bearer", hasToken: true }))).toEqual({ label: "connected", tone: "ok" });
    expect(connectionState(c({ authType: "oauth", signedIn: true, lastStatus: null }))).toEqual({ label: "never used", tone: "idle" });
  });
});

describe("asSentence", () => {
  it("starts a status with a capital, as a line of its own under the name", () => {
    expect(asSentence("needs a token before a run can use it")).toBe("Needs a token before a run can use it");
    expect(asSentence("failed: 401 Unauthorized")).toBe("Failed: 401 Unauthorized");
  });
});

describe("signInWords, how the server lets the agent in", () => {
  it("says a server needs no sign-in", () => {
    expect(signInWords({ authType: "none", hasToken: false })).toBe("Needs no sign-in");
  });

  it("says whether a token server has its token saved", () => {
    expect(signInWords({ authType: "bearer", hasToken: true })).toBe("Signs in with a saved token");
    expect(signInWords({ authType: "bearer", hasToken: false })).toBe("Signs in with a token, and none is saved yet");
  });

  it("says whether an OAuth server is signed in", () => {
    expect(signInWords({ authType: "oauth", hasToken: false, signedIn: true })).toBe("Signed in with the service");
    expect(signInWords({ authType: "oauth", hasToken: false, signedIn: false })).toBe("Signs in with the service, not signed in yet");
  });
});

describe("toolCount and toolWords", () => {
  it("counts the tools in words, with the singular for one", () => {
    expect(toolCount(12)).toBe("12 tools");
    expect(toolCount(1)).toBe("1 tool");
  });

  it("says no tools are known before a run has reached the server", () => {
    expect(toolCount(0)).toBe("tools show after the first run");
  });

  it("writes a tool's name as words", () => {
    expect(toolWords("read_wiki_structure")).toBe("read wiki structure");
    expect(toolWords("search-issues")).toBe("search issues");
  });
});
