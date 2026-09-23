import { describe, expect, it } from "vitest";
import { automationRunRefusal } from "./automation-check";

const CHANGED = "The automation was changed after this run was queued; run it again once it is approved";
const EXAMPLE_CHANGED = "The automation was changed after this example was started; run the example again";

describe("automationRunRefusal (Q82)", () => {
  it.each(["automation", "schedule"])("lets a %s run through at the approved, active version", (purpose) => {
    expect(automationRunRefusal({ purpose, automationVersion: 1 }, { status: "active", version: 1 })).toBeNull();
  });

  it("refuses a command run whose automation was edited back to draft after it was queued", () => {
    expect(automationRunRefusal({ purpose: "automation", automationVersion: 1 }, { status: "draft", version: 2 })).toBe(CHANGED);
  });

  it("refuses a schedule run whose automation is active again but at a newer version than the run's", () => {
    expect(automationRunRefusal({ purpose: "schedule", automationVersion: 1 }, { status: "active", version: 2 })).toBe(CHANGED);
  });

  it("refuses a run whose automation was disabled after it was queued", () => {
    expect(automationRunRefusal({ purpose: "automation", automationVersion: 3 }, { status: "disabled", version: 3 })).toBe(CHANGED);
  });

  it("refuses a command run that does not say which version it was started at", () => {
    expect(automationRunRefusal({ purpose: "automation", automationVersion: null }, { status: "active", version: 1 })).toBe(CHANGED);
  });

  it("runs an example (trial) of a draft at its own version: examples are how a draft gets approved", () => {
    expect(automationRunRefusal({ purpose: "trial", automationVersion: 2 }, { status: "draft", version: 2 })).toBeNull();
  });

  it("refuses an example whose automation moved to a newer version since it was started", () => {
    expect(automationRunRefusal({ purpose: "trial", automationVersion: 1 }, { status: "draft", version: 2 })).toBe(EXAMPLE_CHANGED);
  });

  it("refuses any run of an automation that is gone", () => {
    expect(automationRunRefusal({ purpose: "automation", automationVersion: 1 }, null)).toBe("The automation this run belongs to was deleted");
    expect(automationRunRefusal({ purpose: "trial", automationVersion: 1 }, null)).toBe("The automation this run belongs to was deleted");
  });
});
