import { describe, expect, it } from "vitest";
import { IN_FLIGHT_MESSAGE, MAX_IN_FLIGHT, RATE_LIMIT_MESSAGE, startBlockReason } from "./limits";
import { tokenBucket } from "./rate-limit";

const bucket = () => tokenBucket(5, 10 * 60_000);

describe("startBlockReason", () => {
  it("lets a start through while fewer than three runs are in flight", () => {
    expect(startBlockReason({ inFlight: MAX_IN_FLIGHT - 1, ip: "1.2.3.4", now: 0, bucket: bucket() })).toBeNull();
  });

  it("refuses a start while three runs are already in flight, in the app's own words", () => {
    expect(startBlockReason({ inFlight: 3, ip: "1.2.3.4", now: 0, bucket: bucket() })).toBe(IN_FLIGHT_MESSAGE);
    expect(IN_FLIGHT_MESSAGE).toBe("Three runs are already in progress - try again in a minute");
  });

  it("refuses the sixth start from the same address inside ten minutes", () => {
    const b = bucket();
    const args = { inFlight: 0, ip: "1.2.3.4", bucket: b };
    for (let i = 0; i < 5; i++) expect(startBlockReason({ ...args, now: i * 1000 })).toBeNull();
    expect(startBlockReason({ ...args, now: 5000 })).toBe(RATE_LIMIT_MESSAGE);
    expect(RATE_LIMIT_MESSAGE).toBe("Too many runs from this address - try again later");
  });

  it("still lets another address start while the first one is locked out", () => {
    const b = bucket();
    for (let i = 0; i < 6; i++) startBlockReason({ inFlight: 0, ip: "1.1.1.1", now: 0, bucket: b });
    expect(startBlockReason({ inFlight: 0, ip: "2.2.2.2", now: 0, bucket: b })).toBeNull();
  });

  it("spends no token on a start the in-flight cap refused: the queue being full is not the visitor's fault", () => {
    const b = tokenBucket(1, 10 * 60_000);
    expect(startBlockReason({ inFlight: 3, ip: "1.2.3.4", now: 0, bucket: b })).toBe(IN_FLIGHT_MESSAGE);
    expect(startBlockReason({ inFlight: 0, ip: "1.2.3.4", now: 0, bucket: b })).toBeNull(); // the token was still there
  });
});
