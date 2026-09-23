import { describe, expect, it } from "vitest";
import { outcome, statusLabel } from "./outcome";

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
    expect(outcome("failed", "pass")).toEqual({ label: "Something went wrong", tone: "broken" });
  });

  // Q105: both were one red dot; now "went wrong" and "did not pass" carry different marks
  it("marks a run that broke differently from a result that did not pass", () => {
    expect(outcome("failed", null).tone).toBe("broken");
    expect(outcome("succeeded", "fail").tone).toBe("bad");
  });

  // the run rows call outcome() with Run.outcome, which is optional on the contract and absent on old rows
  it("treats a missing verdict field as 'not judged', never as a pass", () => {
    expect(outcome("succeeded", undefined)).toEqual({ label: "Done", tone: "ok" });
  });
});

describe("outcome - Stop", () => {
  // Q114: another member may have pressed Stop, so it does not say who
  it("says a stopped run was stopped, whatever else is known about it", () => {
    expect(outcome("cancelled", null)).toEqual({ label: "Stopped", tone: "idle" });
    expect(outcome("cancelled", "pass")).toEqual({ label: "Stopped", tone: "idle" });
  });

  it("says a run is stopping between the press and the moment it stops", () => {
    expect(outcome("running", null, true)).toEqual({ label: "Stopping...", tone: "busy" });
    expect(outcome("queued", null, true)).toEqual({ label: "Stopping...", tone: "busy" });
    expect(outcome("succeeded", "pass", true)).toEqual({ label: "Done - looks good", tone: "ok" }); // it finished first
  });
});

describe("statusLabel - the status badge in Details", () => {
  it("reads the enum as words, and cancelled as stopped", () => {
    expect(statusLabel("cancelled")).toBe("stopped");
    expect(statusLabel("pass_with_notes")).toBe("pass with notes");
    expect(statusLabel("running")).toBe("running");
  });
});
