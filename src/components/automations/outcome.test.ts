import { describe, expect, it } from "vitest";
import { outcome } from "./outcome";

describe("outcome", () => {
  it("says what is happening in words an office worker uses, not the status enum", () => {
    expect(outcome("queued", null).label).toBe("Getting ready");
    expect(outcome("running", null).label).toBe("Working on it");
    expect(outcome("evaluating", null).label).toBe("Checking the result");
  });

  it("separates 'done and good' from 'done with notes' from 'done but wrong'", () => {
    expect(outcome("succeeded", "pass")).toEqual({ label: "Done - looks good", tone: "ok" });
    expect(outcome("succeeded", "pass_with_notes")).toEqual({ label: "Done, with notes", tone: "warn" });
    expect(outcome("succeeded", "fail")).toEqual({ label: "Done, but the result did not pass", tone: "bad" });
  });

  it("does not claim a result was checked when the judge was unavailable", () => {
    expect(outcome("succeeded", "unknown")).toEqual({ label: "Done - not checked", tone: "idle" });
    expect(outcome("succeeded", null)).toEqual({ label: "Done", tone: "ok" });
  });

  it("a run that broke reads as a problem whatever the judge said", () => {
    expect(outcome("failed", "pass")).toEqual({ label: "Something went wrong", tone: "bad" });
  });
});
