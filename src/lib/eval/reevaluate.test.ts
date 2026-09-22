import { describe, expect, it, vi } from "vitest";
import type { Verdict } from "@/contracts/eval";
import type { Run, RunEvent } from "@/contracts/run";
import { reevaluate, toEvaluateInput } from "./reevaluate";

const run: Run = {
  id: "run-1",
  prompt: "Using the connected DeepWiki server, write output.csv with area, what_it_does, why_it_matters.",
  status: "succeeded",
  model: "claude-sonnet-5",
  connectionIds: ["conn_deepwiki"],
  report: "Wrote output.csv with three rows.",
  error: null,
  numTurns: 6,
  durationMs: 12_000,
  costUsd: 0.04,
  createdAt: "2026-09-22T08:00:00.000Z",
  finishedAt: "2026-09-22T08:02:00.000Z",
};

const events: RunEvent[] = [
  { seq: 1, at: run.createdAt, kind: "plan", payload: { intent: "first reading", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Read the wiki", status: "pending" }] } },
  { seq: 2, at: run.createdAt, kind: "tool_call", payload: { tool_use_id: "t1", name: "mcp__deepwiki__read_wiki", input: {} } },
  { seq: 3, at: run.createdAt, kind: "tool_call", payload: { tool_use_id: "t2", name: "Write", input: {} } },
  { seq: 4, at: run.createdAt, kind: "tool_call", payload: { tool_use_id: "t3", name: "Write", input: {} } },
  { seq: 5, at: run.createdAt, kind: "plan", payload: { intent: "first reading", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Read the wiki", status: "done" }] } },
];

const files = [{ name: "output.csv", content: "area,what_it_does,why_it_matters\nOverview,\"Servers\",\"Entry point\"\n" }];

const verdict: Verdict = { verdict: "pass", checks: [], judgment: null, review: null, reasons: [], evaluatedAt: "2026-09-22T08:03:00.000Z" };

describe("toEvaluateInput", () => {
  it("takes the plan from the LAST plan event, so the judge sees the steps as they ended", () => {
    const input = toEvaluateInput(run, events, files);
    expect(input.plan?.steps[0].status).toBe("done");
  });

  it("lists every tool the run called, once each, so a claimed connection can be checked", () => {
    expect(toEvaluateInput(run, events, files).toolsUsed).toEqual(["mcp__deepwiki__read_wiki", "Write"]);
  });

  it("dates the evaluation by when the run finished, so re-evaluating later does not move the freshness window", () => {
    expect(toEvaluateInput(run, events, files).today).toBe("2026-09-22");
  });
});

describe("reevaluate", () => {
  it("stores the verdict on the run and returns it", async () => {
    const deps = { load: vi.fn(async () => ({ run, events, files })), evaluate: vi.fn(async () => verdict), save: vi.fn(async () => {}) };
    const got = await reevaluate("run-1", deps);
    expect(got).toEqual(verdict);
    expect(deps.save).toHaveBeenCalledWith("run-1", verdict);
    expect(deps.evaluate).toHaveBeenCalledOnce();
  });

  it("says which run is missing instead of failing somewhere deeper", async () => {
    const deps = { load: vi.fn(async () => null), evaluate: vi.fn(async () => verdict), save: vi.fn(async () => {}) };
    await expect(reevaluate("nope", deps)).rejects.toThrow(/nope/);
    expect(deps.evaluate).not.toHaveBeenCalled();
  });
});
