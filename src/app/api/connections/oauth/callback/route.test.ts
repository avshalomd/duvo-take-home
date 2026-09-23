// The callback: the server sends the browser back here with ?code&state (or ?error). Whatever happens, the person
// lands on the connections page with one plain sentence, never an error's own text or a stack.
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

    expect(landing(res).error).toBe("The sign-in was cancelled");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("passes on the server's own reason for any other refusal", async () => {
    const res = await GET(callback(`error=invalid_scope&error_description=Unknown%20scope%20admin&state=${STATE}`));

    expect(landing(res).error).toBe("The server refused the sign-in: Unknown scope admin");
  });

  it("says the link is incomplete when the code or the state is missing", async () => {
    expect(landing(await GET(callback(`state=${STATE}`))).error).toBe("The sign-in came back incomplete; start it again");
    expect(landing(await GET(callback("code=code-1"))).error).toBe("The sign-in came back incomplete; start it again");
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("refuses a callback this browser did not start (no state cookie, or another one), so a link sent by someone else cannot attach their sign-in here", async () => {
    const without = await GET(callback(`code=code-1&state=${STATE}`, null));
    const other = await GET(callback(`code=code-1&state=${STATE}`, `oauth_state=${"X".repeat(43)}`));

    for (const res of [without, other]) {
      expect(landing(res).error).toBe("This sign-in was not started in this browser, or it took too long; start it again");
    }
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("shows a SignInError's sentence as it is written", async () => {
    h.complete.mockRejectedValue(new SignInError("This sign-in link has expired or was already used; start the sign-in again"));

    const res = await GET(callback(`code=code-1&state=${STATE}`));

    expect(landing(res).error).toBe("This sign-in link has expired or was already used; start the sign-in again");
  });

  it("shows a plain sentence for any other failure, never the error's own text or stack", async () => {
    h.complete.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432 at Socket.fn (db/index.ts:12)"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(callback(`code=code-1&state=${STATE}`));

    expect(landing(res).error).toBe("The sign-in failed; start it again");
    expect(res.headers.get("location")).not.toContain("ECONNREFUSED");
  });
});
