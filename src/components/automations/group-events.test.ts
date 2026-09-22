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
