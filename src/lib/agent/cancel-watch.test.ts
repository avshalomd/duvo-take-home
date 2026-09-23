import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchCancel } from "./cancel-watch";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("watchCancel", () => {
  it("aborts the run's controller within one interval of the user pressing Stop", async () => {
    let requested = false;
    const controller = new AbortController();
    const w = watchCancel({ isRequested: async () => requested, controller, everyMs: 2000 });

    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(false);

    requested = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(true);
    expect(w.cancelled()).toBe(true);
    w.stop();
  });

  it("resolves whenCancelled once the request is seen, so an evaluation in progress can be dropped", async () => {
    const w = watchCancel({ isRequested: async () => true, controller: new AbortController(), everyMs: 2000 });
    let seen = false;
    void w.whenCancelled.then(() => (seen = true));
    await vi.advanceTimersByTimeAsync(2000);
    expect(seen).toBe(true);
  });

  it("never aborts while nothing was requested", async () => {
    const controller = new AbortController();
    const w = watchCancel({ isRequested: async () => false, controller, everyMs: 2000 });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(controller.signal.aborted).toBe(false);
    expect(w.cancelled()).toBe(false);
    w.stop();
  });

  it("ignores a failed read (the database blinked) and still sees the request on the next poll", async () => {
    const isRequested = vi.fn().mockRejectedValueOnce(new Error("fetch failed")).mockResolvedValue(true);
    const controller = new AbortController();
    const w = watchCancel({ isRequested, controller, everyMs: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.signal.aborted).toBe(true);
    w.stop();
  });

  it("stops asking once stopped, so a closed run does not keep reading the database", async () => {
    const isRequested = vi.fn(async () => false);
    const w = watchCancel({ isRequested, controller: new AbortController(), everyMs: 2000 });
    await vi.advanceTimersByTimeAsync(4000);
    w.stop();
    const calls = isRequested.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isRequested.mock.calls.length).toBe(calls);
  });

  it("does not ask again after it has seen the request", async () => {
    const isRequested = vi.fn(async () => true);
    watchCancel({ isRequested, controller: new AbortController(), everyMs: 2000 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(isRequested).toHaveBeenCalledTimes(1);
  });
});
