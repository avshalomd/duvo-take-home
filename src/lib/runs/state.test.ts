import { describe, expect, it } from "vitest";
import { RunEvent, type Plan, type Run } from "@/contracts/run";
import { AgentLimits } from "@/contracts/agent";
import { deriveState } from "./state";
import runsFixture from "../../../fixtures/runs.json";

// The fixtures are the contract's own event shapes, so parsing them here also pins that they stayed valid.
function fixture(id: string, upToSeq = Infinity): { run: Run; events: RunEvent[] } {
  const r = runsFixture.find((x) => x.id === id);
  if (!r) throw new Error(`no fixture run ${id}`);
  const events = r.events.filter((e) => e.seq <= upToSeq).map((e) => RunEvent.parse(e));
  const finished = events.find((e) => e.kind === "finished");
  return {
    run: {
      id: r.id, prompt: r.prompt, status: r.status as Run["status"], model: r.model,
      connectionIds: r.connection_id ? [r.connection_id] : [],
      report: finished ? (finished.payload as { result: string }).result : null,
      error: null, numTurns: r.num_turns ?? null, durationMs: r.duration_ms ?? null, costUsd: r.total_cost_usd ?? null,
      createdAt: r.started_at, finishedAt: r.finished_at ?? null,
    },
    events,
  };
}

const NEWS = "run_01JQ8N4K2W"; // WebSearch/WebFetch/Write, succeeded
const DEEPWIKI = "run_01JQ8P7T5D"; // mcp__deepwiki__* calls, connected server
const RUNNING = "run_01JQ8QB9XM"; // no finished event
const FAILED = "run_01JQ8R2F0C"; // error_max_turns, every tool call failed

describe("deriveState", () => {
  it("counts one turn per tool call and caps it with the agent's maxTurns", () => {
    const { run, events } = fixture(NEWS);
    const state = deriveState(run, events);
    expect(state.turn).toBe(4); // two WebSearch, one WebFetch, one Write
    expect(state.maxTurns).toBe(AgentLimits.maxTurns);
    expect(state.status).toBe("succeeded");
  });

  it("lists the tools used once each, in the order they were first called", () => {
    const { run, events } = fixture(NEWS);
    expect(deriveState(run, events).toolsUsed).toEqual(["WebSearch", "WebFetch", "Write"]);
  });

  it("names the last tool with a one-line summary of its input, and no connection for a native tool", () => {
    const { run, events } = fixture(NEWS);
    const { lastTool } = deriveState(run, events);
    expect(lastTool?.name).toBe("Write");
    expect(lastTool?.summary).toContain("output.csv");
    expect(lastTool?.viaConnection).toBeNull();
  });

  it("reads the connection out of an mcp__<connection>__<tool> call for the last tool", () => {
    const { run, events } = fixture(DEEPWIKI, 8); // stop before the Write call
    const { lastTool } = deriveState(run, events);
    expect(lastTool?.name).toBe("mcp__deepwiki__read_wiki_contents");
    expect(lastTool?.viaConnection).toBe("deepwiki");
  });

  it("takes the connections and their status from the started event and marks the ones actually called", () => {
    const { run, events } = fixture(DEEPWIKI);
    expect(deriveState(run, events).connections).toEqual([{ name: "deepwiki", status: "connected", used: true }]);
    const before = fixture(DEEPWIKI, 2); // connected, but nothing called through it yet
    expect(deriveState(before.run, before.events).connections).toEqual([{ name: "deepwiki", status: "connected", used: false }]);
    const { run: newsRun, events: newsEvents } = fixture(NEWS);
    expect(deriveState(newsRun, newsEvents).connections).toEqual([]);
  });

  it("lists the files from the Write calls, by name, without duplicates", () => {
    const { run, events } = fixture(NEWS);
    expect(deriveState(run, events).files).toEqual(["output.csv"]);
    const { run: r2, events: e2 } = fixture(RUNNING);
    expect(deriveState(r2, e2).files).toEqual([]);
  });

  it("takes the cost and duration from the finished event, and leaves them null while the run is going", () => {
    const { run, events } = fixture(NEWS);
    expect(deriveState(run, events)).toMatchObject({ costUsd: 0.1642, durationMs: 41782 });
    const { run: r2, events: e2 } = fixture(RUNNING);
    const live = deriveState(r2, e2);
    expect(live.status).toBe("running");
    expect(live.turn).toBe(2);
    expect(live.costUsd).toBeNull();
    expect(live.durationMs).toBeNull();
    expect(live.error).toBeNull();
  });

  it("reports the agent's own words as the error when the run finished with is_error", () => {
    const { run, events } = fixture(FAILED);
    const state = deriveState(run, events);
    expect(state.error).toBe("Reached the turn limit without producing a file. Web search returned 400 on every attempt.");
    expect(state.turn).toBe(3);
  });

  it("takes the plan from the last plan event and the current step from the one that is running", () => {
    const { run, events } = fixture(RUNNING);
    const plan: Plan = {
      intent: "List the three newest Next.js releases",
      expectedOutputs: ["a short report"],
      sources: ["web fetch"],
      steps: [
        { index: 0, title: "Find the releases", status: "done" },
        { index: 1, title: "Read each release", status: "running" },
        { index: 2, title: "Report", status: "pending" },
      ],
    };
    const withPlan: RunEvent[] = [
      ...events,
      { seq: 90, at: "2026-09-22T09:40:00.000Z", kind: "plan", payload: { ...plan, steps: plan.steps.map((s) => ({ ...s, status: "pending" as const })) } },
      { seq: 91, at: "2026-09-22T09:41:00.000Z", kind: "plan", payload: plan },
    ];
    const state = deriveState(run, withPlan);
    expect(state.plan).toEqual(plan); // the last plan event is the current plan
    expect(state.currentStep).toEqual({ index: 1, title: "Read each release", status: "running" });
  });

  it("has no plan and no current step when the agent never called the plan tool", () => {
    const { run, events } = fixture(NEWS);
    const state = deriveState(run, events);
    expect(state.plan).toBeNull();
    expect(state.currentStep).toBeNull();
  });
});
