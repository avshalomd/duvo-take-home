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
  const heal = (attempt: number, stopped?: string): RunEvent => ({
    seq: ++seq, at, kind: "heal",
    payload: { attempt, max: 2, reasons: ["At least 8 rows: 3 rows"], feedback: "Add rows until there are 8.", ...(stopped ? { stopped } : {}) },
  });
  const finished: RunEvent = {
    seq: 0, at, kind: "finished",
    payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: "Done." },
  };

  it("opens a group for each attempt, headed by the attempt, holding the heal event and the work that followed", () => {
    const groups = groupEvents([plan(["running"]), call("Write"), heal(1), call("Write")]);
    expect(groups.map((g) => g.title)).toEqual(["step 0", "Fixing what the check found - attempt 1 of 2"]);
    expect(groups[1].events.map((e) => e.kind)).toEqual(["heal", "tool_call"]);
  });

  it("marks an attempt done once the agent finished it, and running until then", () => {
    expect(groupEvents([plan(["done"]), heal(1), call("Write")], "running").at(-1)!.status).toBe("running");
    expect(groupEvents([plan(["done"]), heal(1), call("Write"), { ...finished, seq: ++seq }], "succeeded").at(-1)!.status).toBe("done");
  });

  // Q148: an attempt the engine recorded and then did not make is not still spinning on a finished run
  it("marks an attempt the engine stopped as skipped, and names it so", () => {
    const stopped = groupEvents([plan(["done"]), { ...finished, seq: ++seq }, heal(2, "The fix undid an earlier one.")], "succeeded").at(-1)!;
    expect(stopped.status).toBe("skipped");
    expect(stopped.title).toBe("Stopped trying - attempt 2 of 2");
  });

  // React warned "two children with the same key step-2": after the fix the agent went back to step 2
  it("gives a step the agent comes back to after a fix a group of its own, under a key of its own", () => {
    const events = [
      plan(["running", "pending", "pending"]),
      call("WebSearch"),
      plan(["done", "done", "running"]),
      call("Write"),
      plan(["done", "done", "done"]),
      { ...finished, seq: ++seq },
      heal(1),
      plan(["done", "done", "running"]),
      call("Write"),
      plan(["done", "done", "done"]),
      { ...finished, seq: ++seq },
    ];
    const groups = groupEvents(events, "succeeded");
    expect(groups.map((g) => g.title)).toEqual(["step 0", "step 2", "Fixing what the check found - attempt 1 of 2", "step 2"]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
    // nothing dropped, nothing doubled: every event that is not a plan is filed exactly once
    const filed = groups.flatMap((g) => g.events);
    expect(filed).toHaveLength(events.filter((e) => e.kind !== "plan").length);
    expect(new Set(filed.map((e) => e.seq)).size).toBe(filed.length);
    expect(groups.map((g) => g.status)).toEqual(["done", "done", "done", "done"]);
  });
});

// A run that is over has nothing left to wait for: no group reads pending or running once it has ended.
describe("groupEvents - a finished run shows no waiting markers", () => {
  const finished: RunEvent = {
    seq: 0, at, kind: "finished",
    payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: "Done." },
  };

  it("settles Planning once the plan exists, and works on it while a live run has none", () => {
    expect(groupEvents([text("reading"), plan(["running"]), call("Write")], "running")[0].status).toBe("done");
    expect(groupEvents([text("reading"), call("WebSearch")], "running")[0].status).toBe("running");
    expect(groupEvents([text("reading"), call("WebSearch")], "succeeded")[0].status).toBe("done");
  });

  it("marks where a failed or stopped run stopped, and everything before it as done", () => {
    const noPlan = groupEvents([text("reading"), call("WebFetch")], "failed");
    expect(noPlan.map((g) => g.status)).toEqual(["stopped"]);
    const midway = groupEvents([text("reading"), plan(["running", "pending"]), call("WebFetch"), plan(["done", "running"]), call("Write")], "cancelled");
    expect(midway.map((g) => g.status)).toEqual(["done", "done", "stopped"]);
  });

  it("reads a step the agent never marked done as done on a run that succeeded", () => {
    const groups = groupEvents([plan(["running"]), call("Write"), { ...finished, seq: ++seq }], "succeeded");
    expect(groups.map((g) => g.status)).toEqual(["done"]);
  });
});

describe("groupEvents - the report is on the run's page, not in the timeline", () => {
  it("leaves out the agent's closing text when it is the report it finished with", () => {
    const report = "Done. I wrote output.csv:\n\n| a | b |\n|---|---|\n| 1 | 2 |";
    const end: RunEvent = {
      seq: 0, at, kind: "finished",
      payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: report },
    };
    const groups = groupEvents([plan(["running"]), text("Writing the file now."), call("Write"), text(report), { ...end, seq: ++seq }], "succeeded");
    expect(groups[0].events.map((e) => e.kind)).toEqual(["text", "tool_call", "finished"]);
  });
});
