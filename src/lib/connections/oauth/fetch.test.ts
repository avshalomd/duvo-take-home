// Every request the sign-in makes goes to addresses a remote server gave us (its metadata, its authorization
// server), so each one is checked like a connection's own URL: public hosts only. Redirects included (QA Q83):
// a server must not be able to bounce our server onto our own network with a 302.
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it, vi } from "vitest";
import { MAX_REDIRECTS, guardedFetch } from "./fetch";

const redirect = (location: string, status = 302) => new Response(null, { status, headers: { location } });

describe("guardedFetch", () => {
  it.each(["http://localhost:3000/token", "http://169.254.169.254/latest/meta-data", "https://10.0.0.5/.well-known/oauth-authorization-server"])(
    "refuses %s without sending anything",
    async (url) => {
      const base = vi.fn(async () => new Response("ok"));
      await expect(guardedFetch(base)(url)).rejects.toThrow(/private or local network/);
      expect(base).not.toHaveBeenCalled();
    },
  );

  it("passes a public address through, with a timeout so a silent server cannot hang the sign-in", async () => {
    const base = vi.fn<FetchLike>(async () => new Response("ok"));
    const res = await guardedFetch(base)("https://auth.example.com/token", { method: "POST" });
    expect(res.status).toBe(200);
    const [url, init] = base.mock.calls[0];
    expect(String(url)).toBe("https://auth.example.com/token");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks fetch not to follow redirects itself, so every hop passes the check", async () => {
    const base = vi.fn<FetchLike>(async () => new Response("ok"));
    await guardedFetch(base)("https://auth.example.com/.well-known/oauth-authorization-server");
    expect(base.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it.each(["http://169.254.169.254/latest/meta-data", "http://localhost:5432/", "http://10.0.0.5/admin"])(
    "refuses a redirect to %s before it is fetched",
    async (location) => {
      const base = vi.fn<FetchLike>(async () => redirect(location));

      await expect(guardedFetch(base)("https://mcp.example.com/mcp")).rejects.toThrow(/Refused to follow a redirect to .*private or local network/);
      expect(base).toHaveBeenCalledTimes(1);
    },
  );

  it("follows a redirect to another public address, relative or absolute, and returns its answer", async () => {
    const base = vi.fn<FetchLike>(async (url) => {
      if (String(url) === "https://mcp.example.com/a") return redirect("/b");
      if (String(url) === "https://mcp.example.com/b") return redirect("https://auth.example.com/c", 301);
      return new Response("the document");
    });

    const res = await guardedFetch(base)("https://mcp.example.com/a");

    expect(await res.text()).toBe("the document");
    expect(base.mock.calls.map(([url]) => String(url))).toEqual(["https://mcp.example.com/a", "https://mcp.example.com/b", "https://auth.example.com/c"]);
  });

  it(`stops after ${MAX_REDIRECTS} redirects with a plain error`, async () => {
    let n = 0;
    const base = vi.fn<FetchLike>(async () => redirect(`https://mcp.example.com/loop/${++n}`));

    await expect(guardedFetch(base)("https://mcp.example.com/loop/0")).rejects.toThrow(`Refused to follow more than ${MAX_REDIRECTS} redirects`);
    expect(base).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it("repeats a POST with its body on a 307, and does not carry the Authorization header to another origin", async () => {
    const base = vi.fn<FetchLike>(async (url) => (String(url) === "https://auth.example.com/token" ? redirect("https://other.example.net/token", 307) : new Response("ok")));

    await guardedFetch(base)("https://auth.example.com/token", { method: "POST", body: "grant_type=refresh_token", headers: { authorization: "Basic abc" } });

    const [, second] = base.mock.calls[1];
    expect(second?.method).toBe("POST");
    expect(second?.body).toBe("grant_type=refresh_token");
    expect(new Headers(second?.headers).get("authorization")).toBeNull();
  });

  it("continues a POST as a GET without its body after a 302 or 303, as fetch does", async () => {
    const base = vi.fn<FetchLike>(async (url) => (String(url) === "https://mcp.example.com/mcp" ? redirect("https://mcp.example.com/mcp/", 303) : new Response("ok")));

    await guardedFetch(base)("https://mcp.example.com/mcp", { method: "POST", body: "{}" });

    const [, second] = base.mock.calls[1];
    expect(second?.method).toBe("GET");
    expect(second?.body).toBeUndefined();
  });
});
