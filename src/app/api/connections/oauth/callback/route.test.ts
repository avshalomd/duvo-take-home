// The callback: the server sends the browser back here with ?code&state (or ?error). Whatever happens, the person
// lands on the connections page with a code the page turns into its own sentence: never text of anyone else's in
// the address (security QA), and never an error's own text or a stack.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInError } from "@/lib/connections/oauth/errors";

const h = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/lib/connections/oauth", () => ({ completeOAuth: h.complete }));
vi.mock("@/lib/connections/store", () => ({
  listConnections: async (workspaceId: string) =>
    workspaceId === "ws-a" ? [{ id: "conn-1", name: "Linear", url: "https://mcp.linear.app/mcp", transport: "http", hasToken: false, enabled: true, lastStatus: null }] : [],
}));

import { GET } from "./route";

const STATE = "S".repeat(43);
function callback(query: string, cookie: string | null = `oauth_state=${STATE}`) {
  return new NextRequest(`http://localhost:3008/api/connections/oauth/callback?${query}`, { headers: cookie ? { cookie } : {} });
}
/** Where the browser is sent, and the one message on it. */
function landing(res: Response) {
  expect(res.status).toBe(302);
  const to = new URL(res.headers.get("location")!);
  return { path: to.pathname, signedIn: to.searchParams.get("signed_in"), error: to.searchParams.get("oauth_error") };
}

beforeEach(() => {
  h.complete.mockReset();
  h.complete.mockResolvedValue({ workspaceId: "ws-a", connectionId: "conn-1" });
  vi.unstubAllEnvs();
  vi.stubEnv("BETTER_AUTH_URL", "");
});

describe("GET /api/connections/oauth/callback", () => {
  it("completes the sign-in and lands on the connections page naming the connection", async () => {
    const res = await GET(callback(`code=code-1&state=${STATE}`));

    expect(landing(res)).toEqual({ path: "/settings/connections", signedIn: "Linear", error: null });
    expect(h.complete).toHaveBeenCalledWith({ code: "code-1", state: STATE, redirectUri: "http://localhost:3008/api/connections/oauth/callback" });
  });

  it("uses BETTER_AUTH_URL for the callback address when it is set, as the sign-in's start did", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com/");

    await GET(callback(`code=code-1&state=${STATE}`));

    expect(h.complete).toHaveBeenCalledWith(expect.objectContaining({ redirectUri: "https://app.example.com/api/connections/oauth/callback" }));
  });

  it("clears the state cookie once it has been used", async () => {
    const res = await GET(callback(`code=code-1&state=${STATE}`));

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("oauth_state=;");
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it("says the sign-in was cancelled when the person declined at the server (error=access_denied)", async () => {
    const res = await GET(callback(`error=access_denied&state=${STATE}`));

    expect(landing(res).error).toBe("cancelled");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("says the server refused any other way, and keeps the server's own words for the log, out of the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await GET(callback(`error=invalid_scope&error_description=Your%20account%20is%20locked%2C%20call%20555&state=${STATE}`));

    expect(landing(res).error).toBe("refused");
    expect(res.headers.get("location")).not.toMatch(/locked|555/);
    expect(JSON.stringify(warn.mock.calls)).toContain("Your account is locked, call 555");
  });

  it("says the link is incomplete when the code or the state is missing", async () => {
    expect(landing(await GET(callback(`state=${STATE}`))).error).toBe("incomplete");
    expect(landing(await GET(callback("code=code-1"))).error).toBe("incomplete");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("refuses a callback this browser did not start (no state cookie, or another one), so a link sent by someone else cannot attach their sign-in here", async () => {
    const without = await GET(callback(`code=code-1&state=${STATE}`, null));
    const other = await GET(callback(`code=code-1&state=${STATE}`, `oauth_state=${"X".repeat(43)}`));

    for (const res of [without, other]) {
      expect(landing(res).error).toBe("other_browser");
    }
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("sends a SignInError's code, and its sentence (with the server's words) only to the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.complete.mockRejectedValue(new SignInError("token_refused", "The server did not accept the sign-in: Code redeemed at evil.example"));

    const res = await GET(callback(`code=code-1&state=${STATE}`));

    expect(landing(res).error).toBe("token_refused");
    expect(res.headers.get("location")).not.toContain("evil");
    expect(JSON.stringify(warn.mock.calls)).toContain("Code redeemed at evil.example");
  });

  it("shows a plain sentence for any other failure, never the error's own text or stack", async () => {
    h.complete.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 at Socket.fn (db/index.ts:12)"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(callback(`code=code-1&state=${STATE}`));

    expect(landing(res).error).toBe("failed");
    expect(res.headers.get("location")).not.toContain("ECONNREFUSED");
  });
});
