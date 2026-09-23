import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { groupEvents } from "./group-events";

const at = "2026-09-22T09:14:03.120Z";
let seq = 0;
const text = (t: string): RunEvent => ({ seq: ++seq, at, kind: "text", payload: { text: t } });
const call = (name: string): RunEvent => ({ seq: ++seq, at, kind: "tool_call", payload: { tool_use_id: `t${seq}`, name, input: {} } });
const plan = (statuses: ("pending" | "running" | "done")[]): RunEvent => ({
  seq: ++seq,
  at,
  kind: "plan",
  payload: {
    intent: "do it",
    expectedOutputs: [],
    sources: [],
    steps: statuses.map((status, index) => ({ index, title: `step ${index}`, status })),
  },
});

describe("groupEvents - the timeline is read as the plan, not as a flat log", () => {
  it("puts everything before the first plan under Planning", () => {
    const groups = groupEvents([text("thinking"), call("WebSearch")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Planning");
    expect(groups[0].events).toHaveLength(2);
  });

  it("files the events that happened while a step was running under that step", () => {
    const groups = groupEvents([text("reading the task"), plan(["running", "pending"]), call("WebSearch"), text("found them")]);
    expect(groups.map((g) => g.title)).toEqual(["Planning", "step 0"]);
    expect(groups[1].events.map((e) => e.kind)).toEqual(["tool_call", "text"]);
  });

  it("opens a new group when the plan moves on, and keeps the order of the run", () => {
    const groups = groupEvents([
      plan(["running", "pending"]),
      call("WebSearch"),
      plan(["done", "running"]),
      call("Write"),
    ]);
    expect(groups.map((g) => g.title)).toEqual(["step 0", "step 1"]);
    expect(groups[0].events.map((e) => e.kind)).toEqual(["tool_call"]);
    expect(groups[1].events.map((e) => e.kind)).toEqual(["tool_call"]);
  });

  it("shows each step with the status it ended on, not the one it opened with", () => {
    const groups = groupEvents([plan(["running", "pending"]), call("WebSearch"), plan(["done", "running"])]);
    expect(groups[0].status).toBe("done");
    expect(groups[1].status).toBe("running");
  });
});

// Auto-heal: Details shows each attempt to fix the result, with what the agent was told, and the work it did then
describe("groupEvents - fixing what the check found", () => {
  const heal = (attempt: number): RunEvent => ({
    seq: ++seq, at, kind: "heal", payload: { attempt, max: 2, reasons: ["At least 8 rows: 3 rows"], feedback: "Add rows until there are 8." },
  });
  const finished: RunEvent = {
    seq: 0, at, kind: "finished",
    payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: "Done." },
  };

  it("opens a group for each attempt, headed by the attempt, holding the heal event and the work that followed", () => {
    const groups = groupEvents([plan(["done"]), call("Write"), heal(1), call("Write")]);
    expect(groups.map((g) => g.title)).toEqual(["step 0", "Fixing what the check found - attempt 1 of 2"]);
    expect(groups[1].events.map((e) => e.kind)).toEqual(["heal", "tool_call"]);
  });

  it("marks an attempt done once the agent finished it, and running until then", () => {
    expect(groupEvents([plan(["done"]), heal(1), call("Write")], "running").at(-1)!.status).toBe("running");
    expect(groupEvents([plan(["done"]), heal(1), call("Write"), { ...finished, seq: ++seq }], "succeeded").at(-1)!.status).toBe("done");
  });

  // Q148: an attempt the engine recorded and then did not make is not still spinning on a finished run
  it("marks an attempt of a finished run that was never worked on as skipped", () => {
    expect(groupEvents([plan(["done"]), { ...finished, seq: ++seq }, heal(2)], "succeeded").at(-1)!.status).toBe("skipped");
  });
});
