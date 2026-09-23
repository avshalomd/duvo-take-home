// The OAuth state: the value the server sends back to the callback, so a callback can only finish a sign-in we
// started, once, within ten minutes.
import { describe, expect, it } from "vitest";
import { STATE_TTL_MS, checkState, newState } from "./state";

const T0 = new Date("2026-09-23T10:00:00.000Z");
const later = (ms: number) => new Date(T0.getTime() + ms);

describe("newState", () => {
  it("is 32 random bytes in base64url (43 characters, safe in a URL), so it cannot be guessed", () => {
    expect(newState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newState()));
    expect(seen.size).toBe(50);
  });
});

describe("checkState", () => {
  const state = "a".repeat(43);
  const pending = { state, createdAt: T0.toISOString() };

  it("accepts the state of the sign-in waiting on the connection", () => {
    expect(checkState(pending, state, later(1000))).toBe("ok");
  });

  it("still accepts it just under ten minutes after the sign-in started", () => {
    expect(checkState(pending, state, later(STATE_TTL_MS - 1))).toBe("ok");
  });

  it("refuses it as expired ten minutes after the sign-in started", () => {
    expect(STATE_TTL_MS).toBe(10 * 60 * 1000);
    expect(checkState(pending, state, later(STATE_TTL_MS))).toBe("expired");
  });

  it("refuses a different state as unknown", () => {
    expect(checkState(pending, "b".repeat(43), later(1000))).toBe("unknown");
  });

  it("refuses any state once the sign-in has been used (the pending sign-in is cleared), so a state works once", () => {
    expect(checkState(null, state, later(1000))).toBe("unknown");
    expect(checkState(undefined, state, later(1000))).toBe("unknown");
  });

  it("refuses an empty state even if a stored one were empty", () => {
    expect(checkState({ state: "", createdAt: T0.toISOString() }, "", later(1000))).toBe("unknown");
  });
});
