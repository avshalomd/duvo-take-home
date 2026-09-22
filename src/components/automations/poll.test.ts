import { describe, expect, it } from "vitest";
import { parseRunPayload, shouldPoll } from "./poll";

const payload = {
  run: {
    id: "run_1",
    prompt: "do the thing",
    status: "running",
    model: "claude-sonnet-5",
    connectionIds: [],
    report: null,
    error: null,
    numTurns: null,
    durationMs: null,
    costUsd: null,
    createdAt: "2026-09-22T09:14:03.120Z",
    finishedAt: null,
  },
  events: [
    { seq: 1, at: "2026-09-22T09:14:06.502Z", kind: "tool_call", payload: { tool_use_id: "t1", name: "WebSearch", input: { query: "ai" } } },
  ],
  files: [{ name: "output.csv", mime: "text/csv", bytes: 12 }],
  state: {
    status: "running",
    turn: 1,
    maxTurns: 25,
    plan: null,
    currentStep: null,
    lastTool: null,
    toolsUsed: ["WebSearch"],
    connections: [],
    files: [],
    costUsd: null,
    durationMs: null,
    error: null,
  },
  verdict: null,
};

describe("shouldPoll - the panel only polls a run that can still change", () => {
  it("polls a run that is queued, running or being evaluated", () => {
    expect(shouldPoll("queued")).toBe(true);
    expect(shouldPoll("running")).toBe(true);
    expect(shouldPoll("evaluating")).toBe(true);
  });

  it("stops polling once the run has ended", () => {
    expect(shouldPoll("succeeded")).toBe(false);
    expect(shouldPoll("failed")).toBe(false);
  });
});

describe("parseRunPayload - the poll is validated before it replaces what the server rendered", () => {
  it("accepts the route's payload and carries the verdict", () => {
    const view = parseRunPayload({ ...payload, verdict: null });
    expect(view?.run.id).toBe("run_1");
    expect(view?.events).toHaveLength(1);
    expect(view?.verdict).toBeNull();
  });

  it("returns null for a payload that does not match the contract, so the panel keeps its data", () => {
    expect(parseRunPayload({ error: "not found" })).toBeNull();
    expect(parseRunPayload(null)).toBeNull();
  });
});
