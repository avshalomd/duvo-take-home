import { describe, expect, it } from "vitest";
import type { Plan } from "@/contracts/run";
import { threadSteps } from "./thread-steps";

const plan = (statuses: Plan["steps"][number]["status"][], notes: (string | undefined)[] = []): Plan => ({
  intent: "",
  expectedOutputs: [],
  sources: [],
  steps: statuses.map((status, index) => ({ index, title: `Step ${index + 1}`, status, note: notes[index] })),
});

// The run's plan drawn as the thread (src/components/thread/thread.tsx): the thread knows nothing about runs, so
// this is where a step's check and a stopped run's last step become what the thread draws.
describe("threadSteps - the plan as the thread draws it", () => {
  it("gives the thread every step with its title, status and the agent's note", () => {
    expect(threadSteps(plan(["done", "running", "pending"], ["found 12 stories"]), "running", [])).toEqual([
      { key: 0, title: "Step 1", status: "done", note: "found 12 stories" },
      { key: 1, title: "Step 2", status: "running" },
      { key: 2, title: "Step 3", status: "pending" },
    ]);
  });

  it("flags a finished step the checker doubted, once, in plain words, and not one it believed", () => {
    // The checker's note only repeats the step's own note, which the thread already shows (production, 2026-09-23:
    // "This step may not have done what it says. May not have done what it says: Selected 5...").
    const steps = threadSteps(plan(["done", "done"], ["Selected 5 rounds"]), "succeeded", [
      { stepIndex: 0, onTrack: 0.3, note: "May not have done what it says: Selected 5 rounds" },
      { stepIndex: 1, onTrack: 0.9, note: "Looks done" },
    ]);
    expect(steps[0].flag).toBe("This step may not have done what it says.");
    expect(steps[0].note).toBe("Selected 5 rounds");
    expect(steps[1].flag).toBeUndefined();
  });

  it("marks where a stopped or broken run stopped, instead of a step that is still being worked on", () => {
    for (const status of ["cancelled", "failed"]) {
      const steps = threadSteps(plan(["done", "running", "pending"], [undefined, "reading page 2"]), status, []);
      expect(steps[1]).toEqual({ key: 1, title: "Step 2", status: "pending", note: "Stopped here. reading page 2" });
    }
  });

  it("never leaves a finished run with a step still being worked on", () => {
    expect(threadSteps(plan(["done", "running"]), "succeeded", [])[1].status).not.toBe("running");
  });

  // qa-ai F8: a correct answer sat under "1 of 3 done" with two "Not started" steps, because the agent forgot to tick
  // them. On a run that finished well, a step it did not tick is "not marked", a quiet state of its own.
  it("draws the steps a finished run did not tick as not marked, never as not started", () => {
    const steps = threadSteps(plan(["done", "running", "pending"]), "succeeded", []);
    expect(steps.map((s) => s.status)).toEqual(["done", "unmarked", "unmarked"]);
  });

  it("keeps a live run's steps that have not started as not started", () => {
    expect(threadSteps(plan(["done", "pending"]), "running", [])[1].status).toBe("pending");
  });
});

// Q138: a new run opened on five seconds of plain text before its plan arrived; it opens on a thread already at work
describe("threadSteps - before the plan", () => {
  it("gives a live run with no plan yet one step, reading the brief, being worked on", () => {
    for (const status of ["queued", "running"])
      expect(threadSteps(null, status, [])).toEqual([{ key: "reading", title: "Reading your brief", status: "running" }]);
  });

  it("gives a finished run that never wrote a plan no steps at all", () => {
    expect(threadSteps(null, "succeeded", [])).toEqual([]);
    expect(threadSteps(null, "failed", [])).toEqual([]);
  });
});

// Auto-heal (his call, 2026-09-23): a result the check failed is fixed inside the same run, and the thread goes on
describe("threadSteps - fixing what the check found", () => {
  const heals = [
    { attempt: 1, max: 2, reasons: ["At least 8 rows: 3 rows"] },
    { attempt: 2, max: 2, reasons: ["At least 8 rows: 6 rows"] },
  ];

  it("adds a step for each attempt after the plan, the latest one worked on while the run is live", () => {
    const steps = threadSteps(plan(["done", "done"]), "running", [], heals);
    expect(steps.slice(2)).toEqual([
      { key: "heal-1", title: "Fix what the check found (attempt 1 of 2)", status: "done" },
      { key: "heal-2", title: "Fix what the check found (attempt 2 of 2)", status: "running" },
    ]);
  });

  it("draws every attempt done once the run has finished", () => {
    expect(threadSteps(plan(["done"]), "succeeded", [], heals).slice(1).map((s) => s.status)).toEqual(["done", "done"]);
  });

  it("says where a stopped run stopped while it was fixing", () => {
    expect(threadSteps(plan(["done"]), "cancelled", [], heals.slice(0, 1))[1]).toMatchObject({ status: "pending", note: "Stopped here" });
  });

  // Q148: the engine stops trying when a fix made no progress; that attempt is recorded but never run
  it("draws an attempt the engine did not make as skipped, saying why in plain words", () => {
    const stopped = [heals[0], { ...heals[1], stopped: true }];
    expect(threadSteps(plan(["done"]), "succeeded", [], stopped)[2]).toEqual({
      key: "heal-2",
      title: "Fix what the check found (attempt 2 of 2)",
      status: "skipped",
      note: "Stopped trying: the first fix did not get the result any closer to passing",
    });
  });
});
