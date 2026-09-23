// When an access token is refreshed: before a run, if it expires within 60 seconds.
import { describe, expect, it } from "vitest";
import { REFRESH_MARGIN_MS, expiresAt, needsRefresh } from "./expiry";

const NOW = new Date("2026-09-23T10:00:00.000Z");
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe("expiresAt", () => {
  it("turns the server's expires_in seconds into an absolute time", () => {
    expect(expiresAt(3600, NOW)).toBe("2026-09-23T11:00:00.000Z");
  });

  it("is null when the server did not say when the token expires", () => {
    expect(expiresAt(undefined, NOW)).toBeNull();
  });
});

describe("needsRefresh", () => {
  it("keeps a token that expires in five minutes", () => {
    expect(needsRefresh(inMs(5 * 60 * 1000), NOW)).toBe(false);
  });

  it("refreshes a token that expires in 30 seconds, so it cannot expire during the run", () => {
    expect(REFRESH_MARGIN_MS).toBe(60 * 1000);
    expect(needsRefresh(inMs(30 * 1000), NOW)).toBe(true);
  });

  it("refreshes a token exactly 60 seconds from expiry", () => {
    expect(needsRefresh(inMs(60 * 1000), NOW)).toBe(true);
  });

  it("refreshes a token that has already expired", () => {
    expect(needsRefresh(inMs(-1000), NOW)).toBe(true);
  });

  it("keeps a token with no known expiry: the server did not say, so it is used until it is refused", () => {
    expect(needsRefresh(null, NOW)).toBe(false);
  });
});
