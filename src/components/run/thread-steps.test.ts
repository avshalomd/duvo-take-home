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

  it("flags a finished step the checker doubted, in plain words, and not one it believed", () => {
    const steps = threadSteps(plan(["done", "done"]), "succeeded", [
      { stepIndex: 0, onTrack: 0.3, note: "It found two facts, not three." },
      { stepIndex: 1, onTrack: 0.9, note: "As planned." },
    ]);
    expect(steps[0].flag).toBe("This step may not have done what it says. It found two facts, not three.");
    expect(steps[1].flag).toBeUndefined();
  });

  it("marks where a stopped or broken run stopped, instead of a step that is still being worked on", () => {
    for (const status of ["cancelled", "failed"]) {
      const steps = threadSteps(plan(["done", "running", "pending"], [undefined, "reading page 2"]), status, []);
      expect(steps[1]).toEqual({ key: 1, title: "Step 2", status: "pending", note: "Stopped here. reading page 2" });
    }
  });

  it("never leaves a finished run with a step still being worked on", () => {
    expect(threadSteps(plan(["done", "running"]), "succeeded", [])[1].status).toBe("pending");
  });
});
