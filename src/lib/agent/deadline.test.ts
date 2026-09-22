import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDeadline } from "./deadline";

// Q3: AgentLimits.wallClockMs was never enforced - a hung agent kept the run "running" for ever. The loop is a
// subprocess we cannot unit test, so the timer and the abort are their own module and these tests pin them.
describe("startDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts the controller once the wall clock has run out", () => {
    const d = startDeadline(1000);
    expect(d.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(d.controller.signal.aborted).toBe(true);
  });

  it("reports that it was the deadline that aborted, so the run can say 'timed out' and not just 'aborted'", () => {
    const d = startDeadline(1000);
    expect(d.expired()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(d.expired()).toBe(true);
  });

  it("never aborts a run that finished in time, once its timer is cleared", () => {
    const d = startDeadline(1000);
    d.clear();
    vi.advanceTimersByTime(10_000);
    expect(d.controller.signal.aborted).toBe(false);
    expect(d.expired()).toBe(false);
  });
});
