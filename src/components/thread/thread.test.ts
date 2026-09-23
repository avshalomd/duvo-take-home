import { describe, expect, it } from "vitest";
import { lastReached, threadTone } from "./thread";

describe("the thread's fill", () => {
  it("reaches the running step when there is one", () => {
    expect(lastReached([{ status: "done" }, { status: "running" }, { status: "pending" }])).toBe(1);
  });
  it("reaches the last finished or skipped step when nothing is running", () => {
    expect(lastReached([{ status: "done" }, { status: "skipped" }, { status: "pending" }])).toBe(1);
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
