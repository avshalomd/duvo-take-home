import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("takes the first address of x-forwarded-for: the ones after it are the proxies", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))).toBe("203.0.113.7");
  });

  it("trims the address, so ' 203.0.113.7' and '203.0.113.7' share one bucket", () => {
    expect(clientIp(h({ "x-forwarded-for": " 203.0.113.7 " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded-for header", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("names the caller 'unknown' when no proxy header arrived, so those callers share one bucket", () => {
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
