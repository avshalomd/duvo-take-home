import { describe, expect, it, vi } from "vitest";
import { cacheFor } from "./cache";

// Q177: /api/health?deep=1 is anonymous and its check is a paid model call. The answer is kept for a minute per server
// instance. A fake clock and a fake check: no model, no waiting.
const MINUTE = 60_000;

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("a check kept for a minute", () => {
  it("answers from memory within the minute, and checks again once it has passed", async () => {
    const time = clock();
    const check = vi.fn(async () => ({ usable: true }));
    const cached = cacheFor(MINUTE, check, time.now);

    expect(await cached()).toEqual({ usable: true });
    time.advance(MINUTE - 1);
    expect(await cached()).toEqual({ usable: true });
    expect(check).toHaveBeenCalledTimes(1);

    time.advance(1);
    await cached();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed answer too, so an outage does not turn every request into a model call", async () => {
    const time = clock();
    const check = vi.fn(async () => ({ usable: false, error: "rate limited" }));
    const cached = cacheFor(MINUTE, check, time.now);

    await cached();
    time.advance(30_000);
    expect(await cached()).toEqual({ usable: false, error: "rate limited" });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("lets requests that arrive while a check runs share it", async () => {
    let finish: (v: { usable: boolean }) => void = () => {};
    const check = vi.fn(() => new Promise<{ usable: boolean }>((resolve) => (finish = resolve)));
    const cached = cacheFor(MINUTE, check, clock().now);

    const both = Promise.all([cached(), cached()]);
    finish({ usable: true });
    expect(await both).toEqual([{ usable: true }, { usable: true }]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("does not keep a check that threw: the next request checks again", async () => {
    const check = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ usable: true });
    const cached = cacheFor(MINUTE, check, clock().now);

    await expect(cached()).rejects.toThrow("boom");
    expect(await cached()).toEqual({ usable: true });
    expect(check).toHaveBeenCalledTimes(2);
  });
});
