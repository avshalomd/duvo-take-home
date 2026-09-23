import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { INVITATION_COOKIE } from "@/lib/auth/invitation-cookie";
import { proxy } from "./proxy";

const visit = (url: string, cookie?: string) => proxy(new NextRequest(url, { headers: cookie ? { cookie } : {} }));

describe("proxy: an invitation's link", () => {
  it("lets the invitation page through signed out, and leaves the invitation's id in a cookie for the sign-up that follows", () => {
    const res = visit("https://handover.example/invite/inv_42");
    expect(res.headers.get("location")).toBeNull(); // not sent to sign-in: the page explains itself first
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${INVITATION_COOKIE}=inv_42`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toContain("Path=/api/auth");
  });

  it("sets no invitation cookie on any other page", () => {
    expect(visit("https://handover.example/sign-up?next=%2Finvite%2Finv_42").headers.get("set-cookie")).toBeNull();
    expect(visit("https://handover.example/", "better-auth.session_token=a.b").headers.get("set-cookie")).toBeNull();
  });
});
