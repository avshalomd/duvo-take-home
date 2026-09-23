// Every request the sign-in makes goes to addresses a remote server gave us (its metadata, its authorization
// server), so each one is checked like a connection's own URL: public hosts only.
import { describe, expect, it, vi } from "vitest";
import { guardedFetch } from "./fetch";

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
    const base = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response("ok"));
    const res = await guardedFetch(base)("https://auth.example.com/token", { method: "POST" });
    expect(res.status).toBe(200);
    const [url, init] = base.mock.calls[0];
    expect(String(url)).toBe("https://auth.example.com/token");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
