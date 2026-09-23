import { describe, expect, it } from "vitest";
import { cancelDecision, STOPPED_BY_YOU } from "./cancel-rule";

describe("cancelDecision", () => {
  it("closes a queued run at once, because no loop has picked it up to see the request", () => {
    expect(cancelDecision("queued")).toEqual({ ok: true, closeNow: true });
  });

  it("lets a running run be cancelled through its loop, which aborts the agent within 2 s", () => {
    expect(cancelDecision("running")).toEqual({ ok: true, closeNow: false });
  });

  it("lets a run in evaluation be cancelled through its loop too: the verdict is dropped", () => {
    expect(cancelDecision("evaluating")).toEqual({ ok: true, closeNow: false });
  });

  it.each(["succeeded", "failed"])("refuses a %s run in plain words: it has already finished", (status) => {
    const d = cancelDecision(status);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("This run has already finished");
  });

  it("refuses a run that was already stopped, saying so", () => {
    const d = cancelDecision("cancelled");
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.reason).toBe("This run was already stopped");
  });

  it("refuses a status it does not know rather than guessing", () => {
    expect(cancelDecision("paused").ok).toBe(false);
  });

  it("names a stopped run the way the UI shows it", () => {
    expect(STOPPED_BY_YOU).toBe("Stopped by you");
  });
});
