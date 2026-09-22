import { describe, expect, it } from "vitest";
import { createPlanServer } from "./plan-tool";

// Q4: the plan server used to be one module-level instance shared by every run, so a second concurrent run got
// "Already connected" and no plan tool at all. One instance per run is the fix, and this is what pins it.
describe("createPlanServer", () => {
  it("returns a fresh server on every call, so two concurrent runs never share one connection", () => {
    const a = createPlanServer();
    const b = createPlanServer();
    expect(a).not.toBe(b);
    expect(a.instance).not.toBe(b.instance);
  });

  it("registers as an in-process sdk server under the plan key, so its tools arrive as mcp__plan__*", () => {
    const server = createPlanServer();
    expect(server.type).toBe("sdk");
    expect(server.name).toBe("plan");
  });
});
