import { describe, expect, it } from "vitest";
import { lastReached, nextTrack, planShape, threadTone } from "./thread";

describe("the thread's fill", () => {
  it("reaches the running step when there is one", () => {
    expect(lastReached([{ status: "done" }, { status: "running" }, { status: "pending" }])).toBe(1);
  });
  it("reaches the last finished or skipped step when nothing is running", () => {
    expect(lastReached([{ status: "done" }, { status: "skipped" }, { status: "pending" }])).toBe(1);
  });
  it("reaches a step the finished run did not tick: it is settled, not waiting", () => {
    expect(lastReached([{ status: "done" }, { status: "unmarked" }, { status: "unmarked" }])).toBe(2);
  });
  it("reaches nothing before the first step starts", () => {
    expect(lastReached([{ status: "pending" }, { status: "pending" }])).toBe(-1);
  });
});

describe("the thread's colour", () => {
  it("is live while the run works, done when it succeeded, failed on a failure or a failing verdict, stopped when cancelled", () => {
    expect(threadTone("running")).toBe("live");
    expect(threadTone("evaluating")).toBe("live");
    expect(threadTone("succeeded", "pass")).toBe("done");
    expect(threadTone("succeeded", "fail")).toBe("failed");
    expect(threadTone("failed")).toBe("failed");
    expect(threadTone("cancelled")).toBe("stopped");
  });
});

// Review (frontend): a live run renders its panel every second with a new steps array, and each render tore down and
// rebuilt the thread's ResizeObserver and set a new track, a second render every time. The thread now re-measures when
// the plan's shape changes, and a measure that finds the same track changes nothing.
describe("when the thread measures again", () => {
  const plan = (running: number) =>
    ["Search", "Read", "Write"].map((title, i) => ({ key: i, title, status: i < running ? ("done" as const) : i === running ? ("running" as const) : ("pending" as const) }));

  it("reads a new array with the same steps and statuses as the same plan", () => {
    expect(planShape(plan(1))).toBe(planShape(plan(1)));
  });

  it("sees a step that starts or finishes, and a step added", () => {
    expect(planShape(plan(2))).not.toBe(planShape(plan(1)));
    expect(planShape([...plan(1), { key: 3, title: "Check", status: "pending" }])).not.toBe(planShape(plan(1)));
  });

  it("keeps the track it has when a measure finds the same one", () => {
    const track = { top: 10, height: 80, fill: 40 };
    expect(nextTrack(track, { top: 10, height: 80, fill: 40 })).toBe(track);
    expect(nextTrack(track, { top: 10, height: 80, fill: 80 })).toEqual({ top: 10, height: 80, fill: 80 });
  });
});
