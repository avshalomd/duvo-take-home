// The start: the settings page's "Sign in" button is a link here. It sends the browser on to the server's sign-in
// page, and remembers in a cookie which sign-in this browser started.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInError } from "@/lib/connections/oauth/errors";

const h = vi.hoisted(() => ({ start: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/connections/oauth", () => ({ startOAuth: h.start }));
vi.mock("@/lib/auth/session", () => ({ sessionFromHeaders: h.session }));

import { GET } from "./route";

const ID = "6f1c2a4e-2f8e-4c1e-9a53-0b7d7c1d2e01";
const STATE = "S".repeat(43);
const AUTHORIZE = `https://mcp.linear.app/authorize?response_type=code&client_id=c1&state=${STATE}&code_challenge=x&code_challenge_method=S256`;
const start = (query = `id=${ID}`) => new NextRequest(`http://localhost:3008/api/connections/oauth/start?${query}`);
const errorOf = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("oauth_error");

beforeEach(() => {
  h.start.mockReset();
  h.start.mockResolvedValue({ authorizeUrl: AUTHORIZE });
  h.session.mockReset();
  h.session.mockResolvedValue({ userId: "u1", userName: "A", email: "a@example.com", workspaceId: "ws-a", workspaceName: "A", role: "owner" });
  vi.unstubAllEnvs();
  vi.stubEnv("BETTER_AUTH_URL", "");
});

describe("GET /api/connections/oauth/start", () => {
  it("sends the browser to the server's authorization URL for a connection of the session's workspace", async () => {
    const res = await GET(start());

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(AUTHORIZE);
    expect(h.start).toHaveBeenCalledWith("ws-a", ID, "http://localhost:3008/api/connections/oauth/callback");
  });

  it("remembers the sign-in's state in a short-lived, script-proof cookie scoped to the OAuth routes", async () => {
    const res = await GET(start());

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`oauth_state=${STATE}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i); // sent on the server's redirect back, a top-level GET
    expect(cookie).toContain("Path=/api/connections/oauth");
    expect(cookie).toContain("Max-Age=600");
  });

  it("uses BETTER_AUTH_URL for the callback address when it is set", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.com");

    await GET(start());

    expect(h.start).toHaveBeenCalledWith("ws-a", ID, "https://app.example.com/api/connections/oauth/callback");
  });

  it("answers 401 without a session", async () => {
    h.session.mockResolvedValue(null);

    const res = await GET(start());

    expect(res.status).toBe(401);
    expect(h.start).not.toHaveBeenCalled();
  });

  it("refuses a member, who may see the connections but not change them (Q89): no sign-in starts, no cookie is set", async () => {
    h.session.mockResolvedValue({ userId: "u2", userName: "M", email: "m@example.com", workspaceId: "ws-a", workspaceName: "A", role: "member" });

    const res = await GET(start());

    expect(new URL(res.headers.get("location")!).pathname).toBe("/settings/connections");
    expect(errorOf(res)).toBe("Only an owner or an admin can sign a connection in");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(h.start).not.toHaveBeenCalled();
  });

  it("lets an admin start a sign-in, as the settings actions do", async () => {
    h.session.mockResolvedValue({ userId: "u3", userName: "Ad", email: "ad@example.com", workspaceId: "ws-a", workspaceName: "A", role: "admin" });

    const res = await GET(start());

    expect(res.headers.get("location")).toBe(AUTHORIZE);
    expect(h.start).toHaveBeenCalledOnce();
  });

  it("goes back to the connections page when the id is not a connection id", async () => {
    const res = await GET(start("id=not-an-id"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/settings/connections");
    expect(errorOf(res)).toBe("That connection was not found");
    expect(h.start).not.toHaveBeenCalled();
  });

  it("goes back to the connections page with the SignInError's sentence, e.g. a server without OAuth", async () => {
    h.start.mockRejectedValue(new SignInError("This server does not offer sign-in; add a token instead"));

    const res = await GET(start());

    expect(errorOf(res)).toBe("This server does not offer sign-in; add a token instead");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("shows a plain sentence for any other failure, never the error's own text", async () => {
    h.start.mockRejectedValue(new Error("relation \"connections\" does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET(start());

    expect(errorOf(res)).toBe("The sign-in could not start; try again");
  });
});
