import { describe, expect, it } from "vitest";
import { IN_FLIGHT_MESSAGE, MAX_IN_FLIGHT, startBlockReason } from "./limits";
import { tokenBucket } from "./rate-limit";

const MIN = 60_000;
const bucket = () => tokenBucket(5, 10 * MIN);

// Security QA: the per-workspace limits alone let anyone make accounts and workspaces, each with limits of its own,
// all spending the operator's model key. The deployment keeps a cap of its own across every workspace.
describe("startBlockReason: the deployment's cap on runs in flight", () => {
  it("is six runs, across every workspace", () => {
    expect(MAX_IN_FLIGHT).toBe(6);
  });

  it("lets a start through while fewer than six runs are in flight across the deployment", () => {
    expect(startBlockReason({ inFlight: MAX_IN_FLIGHT - 1, ip: "1.2.3.4", now: 0, bucket: bucket() })).toBeNull();
  });

  it("refuses a start while six runs are already in flight, in the app's own words", () => {
    expect(startBlockReason({ inFlight: 6, ip: "1.2.3.4", now: 0, bucket: bucket() })).toBe(IN_FLIGHT_MESSAGE);
    expect(IN_FLIGHT_MESSAGE).toBe("Handover is busy with other runs right now - try again in a minute");
  });

  it("holds a scheduled start, which has no address, to the same cap", () => {
    expect(startBlockReason({ inFlight: 6, ip: null, now: 0, bucket: bucket() })).toBe(IN_FLIGHT_MESSAGE);
    expect(startBlockReason({ inFlight: 5, ip: null, now: 0, bucket: bucket() })).toBeNull();
  });

  it("spends no token on a start the cap refused: the deployment being busy is not the visitor's fault", () => {
    const b = tokenBucket(1, 10 * MIN);
    expect(startBlockReason({ inFlight: 6, ip: "1.2.3.4", now: 0, bucket: b })).toBe(IN_FLIGHT_MESSAGE);
    expect(startBlockReason({ inFlight: 0, ip: "1.2.3.4", now: 0, bucket: b })).toBeNull(); // the token was still there
  });
});

// Q206: "try again later" gave no time, unlike the daily limit, which says when it resets.
describe("startBlockReason: one address starting too often", () => {
  it("refuses the sixth start inside ten minutes, and says when the address can start again", () => {
    const b = bucket();
    const args = { inFlight: 0, ip: "1.2.3.4", bucket: b };
    for (let i = 0; i < 5; i++) expect(startBlockReason({ ...args, now: i * MIN })).toBeNull();
    // the first start (at 0) leaves the ten-minute window at 10 min: five minutes from now
    expect(startBlockReason({ ...args, now: 5 * MIN })).toBe("Too many runs from this address - try again in about 5 minutes");
  });

  it("rounds the wait up to whole minutes, and says a short one in words", () => {
    const b = bucket();
    for (let i = 0; i < 5; i++) startBlockReason({ inFlight: 0, ip: "1.2.3.4", now: 0, bucket: b });
    const at = (now: number) => startBlockReason({ inFlight: 0, ip: "1.2.3.4", now, bucket: b });
    expect(at(10 * MIN - 61_000)).toBe("Too many runs from this address - try again in about 2 minutes");
    expect(at(9 * MIN)).toBe("Too many runs from this address - try again in about a minute");
    expect(at(10 * MIN - 30_000)).toBe("Too many runs from this address - try again in less than a minute");
  });

  it("still lets another address start while the first one is locked out", () => {
    const b = bucket();
    for (let i = 0; i < 6; i++) startBlockReason({ inFlight: 0, ip: "1.1.1.1", now: 0, bucket: b });
    expect(startBlockReason({ inFlight: 0, ip: "2.2.2.2", now: 0, bucket: b })).toBeNull();
  });
});
