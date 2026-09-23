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
  it("shows the SDK's own turn count on a finished run and caps it with the agent's maxTurns", () => {
    const { run, events } = fixture(NEWS);
    const state = deriveState(run, events);
    expect(state.turn).toBe(5); // the finished event's num_turns, the count the cap applied to
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
    expect(state.turn).toBe(12); // the finished event's num_turns
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

  // Q32/Q33, both from the same reading of a real run: the card said "turn 8 of 25" where the agent had taken
  // three, and it showed ToolSearch - the SDK's own tool lookup - as the agent's last tool.
  it("reads the turn from the assistant turn the mapper stamped while the run is still going", () => {
    const { run, events } = fixture(NEWS);
    const stamped = events.filter((e) => e.kind !== "finished").map((e, i) => ({ ...e, payload: { ...e.payload, turn: i < 3 ? 1 : 2 } }) as RunEvent);
    expect(deriveState(run, stamped).turn).toBe(2);
  });

  it("still counts tool calls for a running run recorded before the turn was stamped", () => {
    const { run, events } = fixture(NEWS);
    expect(deriveState(run, events.filter((e) => e.kind !== "finished")).turn).toBe(4); // the four tool calls of the fixture
  });

  it("ignores the SDK's own ToolSearch call: it is the harness looking for tools, not the agent working", () => {
    const { run, events } = fixture(NEWS);
    const withSearch: RunEvent[] = [
      { seq: 100, at: "2026-09-22T09:50:00.000Z", kind: "tool_call", payload: { tool_use_id: "ts1", name: "ToolSearch", input: { query: "web" } } },
      ...events,
    ];
    const state = deriveState(run, withSearch);
    expect(state.toolsUsed).not.toContain("ToolSearch");
    expect(state.lastTool?.name).toBe("Write");
  });

  it("has no plan and no current step when the agent never called the plan tool", () => {
    const { run, events } = fixture(NEWS);
    const state = deriveState(run, events);
    expect(state.plan).toBeNull();
    expect(state.currentStep).toBeNull();
  });
});

// v2: the stepper's per-step marks, the guards' notices and Stop all read from the same events.
describe("deriveState - per-step checks, guards and a stopped run", () => {
  const { run, events } = fixture(RUNNING);
  const check = (seq: number, stepIndex: number, onTrack: number, note: string): RunEvent => ({
    seq, at: "2026-09-22T09:40:00.000Z", kind: "check", payload: { stepIndex, onTrack, note },
  });
  type Decision = "allowed" | "blocked" | "flagged" | "unchecked";
  const guard = (seq: number, g: "path" | "url" | "write" | "connection", decision: Decision, target?: string): RunEvent => ({
    seq, at: "2026-09-22T09:40:00.000Z", kind: "guard", payload: { guard: g, tool: "WebFetch", decision, reason: `${g} ${decision}`, target },
  });

  it("keeps the latest check of each step, in step order", () => {
    const withChecks = [...events, check(90, 1, 0.9, "read all three"), check(91, 0, 0.3, "found only two"), check(92, 0, 0.8, "found all three")];
    expect(deriveState(run, withChecks).stepChecks).toEqual([
      { stepIndex: 0, onTrack: 0.8, note: "found all three" },
      { stepIndex: 1, onTrack: 0.9, note: "read all three" },
    ]);
  });

  it("has no step checks on a run that was never checked", () => {
    expect(deriveState(run, events).stepChecks).toEqual([]);
  });

  it("lists the guard decisions that stopped, marked or could not check something, and leaves out the allowed ones", () => {
    const withGuards = [...events, guard(90, "url", "allowed"), guard(91, "url", "blocked", "evil.example"), guard(92, "connection", "flagged", "github"), guard(93, "write", "unchecked")];
    expect(deriveState(run, withGuards).guards).toEqual([
      { guard: "url", decision: "blocked", reason: "url blocked", target: "evil.example" },
      { guard: "connection", decision: "flagged", reason: "connection flagged", target: "github" },
      { guard: "write", decision: "unchecked", reason: "write unchecked" },
    ]);
  });

  it("has no guard notices when every call was allowed", () => {
    expect(deriveState(run, [...events, guard(90, "path", "allowed")]).guards).toEqual([]);
  });

  it("says a stopped run is cancelled, with no error and no step still running", () => {
    const plan: Plan = {
      intent: "x", expectedOutputs: ["y"], sources: [],
      steps: [
        { index: 0, title: "Find", status: "done" },
        { index: 1, title: "Read", status: "running" },
      ],
    };
    const stopped: RunEvent[] = [
      ...events,
      { seq: 90, at: "2026-09-22T09:40:00.000Z", kind: "plan", payload: plan },
      { seq: 91, at: "2026-09-22T09:41:00.000Z", kind: "finished", payload: { subtype: "error_during_execution", is_error: true, num_turns: 3, duration_ms: 9000, total_cost_usd: 0.02, result: "aborted by the user" } },
    ];
    const state = deriveState({ ...run, status: "cancelled", error: "cancelled" }, stopped);
    expect(state.status).toBe("cancelled");
    expect(state.error).toBeNull(); // pressing Stop is not a failure
    expect(state.currentStep).toBeNull(); // nothing is being worked on any more
    expect(state.plan?.steps[1].status).toBe("running"); // the plan stays as the agent left it: the stepper says where it stopped
  });
});
