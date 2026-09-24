import { describe, expect, it } from "vitest";
import { notCheckedLine, outcome, outcomeHint, statusLabel } from "./outcome";

describe("outcome", () => {
  it("says what is happening in words an office worker uses, not the status enum", () => {
    expect(outcome("queued", null).label).toBe("Getting ready");
    expect(outcome("running", null).label).toBe("Working on it");
    expect(outcome("evaluating", null).label).toBe("Checking the result");
  });

  it("separates 'done and good' from 'done with notes' from 'done but wrong'", () => {
    expect(outcome("succeeded", "pass")).toEqual({ label: "Done, looks good", tone: "ok" });
    expect(outcome("succeeded", "pass_with_notes")).toEqual({ label: "Done, with notes", tone: "warn" });
    expect(outcome("succeeded", "fail")).toEqual({ label: "Done, but the result did not pass", tone: "bad" });
  });

  // qa-ai U7: a run never checked read "Done" with a green dot on the rail and the run page, "Not checked" with a
  // hollow ring in the picker. One word and one glyph everywhere, whether the check was down or never ran.
  it("does not claim a result was checked when the check was unavailable or never ran", () => {
    expect(outcome("succeeded", "unknown")).toEqual({ label: "Done, not checked", tone: "unchecked" });
    expect(outcome("succeeded", null)).toEqual({ label: "Done, not checked", tone: "unchecked" });
  });

  // qa-ai U6: "Done - looks good", "Done, with notes" and "Done, but the result did not pass" side by side
  it("words every finished outcome in one style: a comma, never a spaced hyphen", () => {
    for (const v of ["pass", "pass_with_notes", "fail", "unknown", null, "cannot_do", "needs_answer"]) {
      expect(outcome("succeeded", v).label).not.toContain(" - ");
    }
  });

  // qa-ai F3 (the owner's call): neutral outcomes of their own, not red and not "did not pass"
  it("says a run that truthfully could not do the task, or needs an answer, in its own calm words", () => {
    expect(outcome("succeeded", "cannot_do")).toEqual({ label: "Could not be done", tone: "idle" });
    expect(outcome("succeeded", "needs_answer")).toEqual({ label: "Needs your answer", tone: "asks" });
  });

  it("a run that broke reads as a problem whatever the judge said", () => {
    expect(outcome("failed", "pass")).toEqual({ label: "Something went wrong", tone: "bad" });
  });

  // Q105: "went wrong" and "did not pass" share a colour; their words tell them apart (the rail says them on hover)
  it("tells a run that broke from a result that did not pass by its words", () => {
    expect(outcome("failed", null).label).not.toBe(outcome("succeeded", "fail").label);
  });

  // the run rows call outcome() with Run.outcome, which is optional on the contract and absent on old rows
  it("treats a missing verdict field as not checked, never as a pass", () => {
    expect(outcome("succeeded", undefined)).toEqual({ label: "Done, not checked", tone: "unchecked" });
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
    expect(outcome("succeeded", "pass", true)).toEqual({ label: "Done, looks good", tone: "ok" }); // it finished first
  });
});

// Auto-heal (his call, 2026-09-23): the run fixes a result the check failed inside the same run, and says pass or
// fail only once every attempt is used. Until then it is in progress everywhere: no red, no "did not pass".
describe("outcome - a run fixing what the check found", () => {
  it("reads as progress while it fixes, naming the attempt when it knows the limit", () => {
    expect(outcome("running", null, false, { attempts: 1, max: 2 })).toEqual({
      label: "Fixing what the check found (attempt 1 of 2)",
      tone: "busy",
    });
    expect(outcome("evaluating", null, false, { attempts: 2, max: 2 }).tone).toBe("busy");
    // the rail knows the count from the run row, not the limit
    expect(outcome("running", null, false, { attempts: 1 }).label).toBe("Fixing what the check found");
  });

  it("says a fixed result the way it says any good result", () => {
    expect(outcome("succeeded", "pass", false, { attempts: 1 })).toEqual({ label: "Done, looks good", tone: "ok" });
    expect(outcome("succeeded", "pass_with_notes", false, { attempts: 2 })).toEqual({ label: "Done, with notes", tone: "warn" });
  });

  it("says how many attempts did not fix a result that still did not pass", () => {
    expect(outcome("succeeded", "fail", false, { attempts: 2 })).toEqual({ label: "Did not pass after 2 attempts to fix it", tone: "bad" });
    expect(outcome("succeeded", "fail", false, { attempts: 1 }).label).toBe("Did not pass after 1 attempt to fix it");
  });

  it("reads a run with no attempts exactly as before", () => {
    expect(outcome("succeeded", "fail", false, { attempts: 0 })).toEqual(outcome("succeeded", "fail"));
    expect(outcome("running", null, false, { attempts: 0 })).toEqual(outcome("running", null));
  });

  it("lets Stop win over fixing", () => {
    expect(outcome("running", null, true, { attempts: 1, max: 2 }).label).toBe("Stopping...");
    expect(outcome("cancelled", null, false, { attempts: 1 }).label).toBe("Stopped");
  });
});

// qa-ai U7: Check again sat beside a result the checker could not reach (Q208), not beside one never checked at all
describe("notCheckedLine - the sentence beside Check again", () => {
  it("says why a finished run was not checked, whether the checker was down or it never ran", () => {
    expect(notCheckedLine("succeeded", "unknown")).toBe("The result was not checked: the checker could not be reached.");
    expect(notCheckedLine("succeeded", null)).toBe("The result has not been checked.");
    expect(notCheckedLine("succeeded", undefined)).toBe("The result has not been checked.");
  });

  it("says nothing for a checked, a live, a stopped or a broken run", () => {
    expect(notCheckedLine("succeeded", "pass")).toBeNull();
    expect(notCheckedLine("succeeded", "cannot_do")).toBeNull();
    expect(notCheckedLine("running", null)).toBeNull();
    expect(notCheckedLine("cancelled", null)).toBeNull();
    expect(notCheckedLine("failed", null)).toBeNull();
  });
});

// qa-ai F3: "Needs your answer" is answered through Ask for a change
describe("outcomeHint - what to do next, beside a neutral outcome", () => {
  it("points a run that needs an answer to Ask for a change, and one that could not be done to its report", () => {
    expect(outcomeHint("succeeded", "needs_answer")).toMatch(/Ask for a change/);
    expect(outcomeHint("succeeded", "cannot_do")).toMatch(/report/);
  });

  it("has no hint for any other outcome", () => {
    for (const v of ["pass", "pass_with_notes", "fail", "unknown", null]) expect(outcomeHint("succeeded", v)).toBeNull();
  });
});

describe("statusLabel - the status badge in Details", () => {
  it("reads the enum as words, and cancelled as stopped", () => {
    expect(statusLabel("cancelled")).toBe("stopped");
    expect(statusLabel("pass_with_notes")).toBe("pass with notes");
    expect(statusLabel("running")).toBe("running");
  });
});
