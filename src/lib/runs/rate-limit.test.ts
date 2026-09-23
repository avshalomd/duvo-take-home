import { describe, expect, it } from "vitest";
import { tokenBucket } from "./rate-limit";

// The clock is injected (every take() takes `now`), so the ten-minute window is testable without waiting.
const MIN = 60_000;

describe("tokenBucket", () => {
  it("allows five starts from one address and refuses the sixth inside the window", () => {
    const bucket = tokenBucket(5, 10 * MIN);
    const taken = [0, 1, 2, 3, 4, 5].map((i) => bucket.take("1.2.3.4", i * MIN));
    expect(taken).toEqual([true, true, true, true, true, false]);
  });

  it("counts each address separately, so one visitor cannot lock out another", () => {
    const bucket = tokenBucket(2, 10 * MIN);
    expect(bucket.take("1.1.1.1", 0)).toBe(true);
    expect(bucket.take("1.1.1.1", 0)).toBe(true);
    expect(bucket.take("1.1.1.1", 0)).toBe(false);
    expect(bucket.take("2.2.2.2", 0)).toBe(true);
  });

  it("lets an address start again once its oldest start has fallen out of the window", () => {
    const bucket = tokenBucket(2, 10 * MIN);
    bucket.take("1.2.3.4", 0);
    bucket.take("1.2.3.4", 5 * MIN);
    expect(bucket.take("1.2.3.4", 9 * MIN)).toBe(false); // both starts still inside the ten minutes
    expect(bucket.take("1.2.3.4", 11 * MIN)).toBe(true); // the first one has expired
  });

  // Q206: a refusal says when to try again, so the bucket says when its next token frees up.
  it("says how long until an address may start again: when its oldest start leaves the window", () => {
    const bucket = tokenBucket(2, 10 * MIN);
    expect(bucket.retryAfter("1.2.3.4", 0)).toBe(0); // nothing taken: now
    bucket.take("1.2.3.4", 1 * MIN);
    expect(bucket.retryAfter("1.2.3.4", 2 * MIN)).toBe(0); // one token left: now
    bucket.take("1.2.3.4", 3 * MIN);
    expect(bucket.retryAfter("1.2.3.4", 4 * MIN)).toBe(7 * MIN); // the start at 1 min leaves at 11 min
    expect(bucket.retryAfter("5.6.7.8", 4 * MIN)).toBe(0); // another address is not held back
  });

  it("forgets an address that has gone quiet, so the map cannot grow for ever", () => {
    const bucket = tokenBucket(1, 10 * MIN);
    bucket.take("1.2.3.4", 0);
    expect(bucket.size(11 * MIN)).toBe(0);
  });
});
