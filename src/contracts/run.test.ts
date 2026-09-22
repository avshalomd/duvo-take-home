import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FileMeta, Plan, PlanStep, PlanStepStatus, Run, RunEvent, RunState, RunStatus } from "./run";
import { AgentLimits } from "./agent";
import { deriveState } from "../lib/runs/state";
import runsFixture from "../../fixtures/runs.json";

// The fixture is the shape the database will hold (snake_case); the contract is the shape the app passes
// around (camelCase). Run and FileMeta are therefore tested through the stubs that do that mapping, and
// RunEvent is tested against the fixture events directly - those are stored as-is.
type FixtureEvent = { seq: number; kind: string; at: string; payload: Record<string, unknown> };
type FixtureRun = {
  id: string; prompt: string; status: string; model: string; connection_id: string | null; started_at: string;
  finished_at: string | null; num_turns: number | null; duration_ms: number | null; total_cost_usd: number | null;
  artifacts: { name: string; mime: string; bytes: number }[]; events: FixtureEvent[];
};
const fixtureRuns = runsFixture as unknown as FixtureRun[];
const fixtureEvents = fixtureRuns.flatMap((r) => r.events);

function anEvent(kind: string): FixtureEvent {
  const found = fixtureEvents.find((e) => e.kind === kind);
  if (!found) throw new Error(`fixtures/runs.json has no ${kind} event`);
  return found;
}

/** The same object without one key, so a rejection names that key and nothing else. */
function omit<T extends object>(value: T, key: keyof T & string) {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy;
}

/** The same event with one payload field taken away, so a rejection names that field and nothing else. */
function without(event: FixtureEvent, field: string) {
  return { ...event, payload: omit(event.payload, field) };
}

/** The same event with one payload field replaced by a wrong-typed value. */
function withField(event: FixtureEvent, field: string, value: unknown) {
  return { ...event, payload: { ...event.payload, [field]: value } };
}

// The reads are built from the fixture here: since P1 landed, src/lib/runs/queries.ts reads the database.
function toRun(r: FixtureRun): Run {
  const finished = r.events.find((e) => e.kind === "finished")?.payload as { result?: string } | undefined;
  return {
    id: r.id, prompt: r.prompt, status: r.status as Run["status"], model: r.model,
    connectionIds: r.connection_id ? [r.connection_id] : [], report: finished?.result ?? null, error: null,
    numTurns: r.num_turns ?? null, durationMs: r.duration_ms ?? null, costUsd: r.total_cost_usd ?? null,
    createdAt: r.started_at, finishedAt: r.finished_at ?? null,
  };
}
const listRuns = async () => fixtureRuns.map(toRun);
const getRun = async (id: string) => {
  const r = fixtureRuns.find((x) => x.id === id);
  if (!r) return null;
  return { run: toRun(r), events: r.events as unknown as RunEvent[], files: r.artifacts.map((a) => ({ name: a.name, mime: a.mime, bytes: a.bytes })), verdict: null };
};
const getFile = async (runId: string, name: string) => {
  const a = fixtureRuns.find((x) => x.id === runId)?.artifacts.find((f) => f.name === name);
  return a ? { meta: { name: a.name, mime: a.mime, bytes: a.bytes }, content: "title,source,url,published_at,summary\n" } : null;
};

async function loadRun(id: string) {
  const got = await getRun(id);
  if (!got) throw new Error(`fixtures/runs.json has no run ${id}`);
  return got;
}

describe("RunStatus", () => {
  it("accepts every status the fixture runs are in", () => {
    for (const r of fixtureRuns) expect(RunStatus.parse(r.status)).toBe(r.status);
  });

  it("rejects a status of done", () => {
    expect(RunStatus.safeParse("done").success).toBe(false);
  });
});

describe("RunEvent", () => {
  it("accepts every event of every fixture run", () => {
    expect(fixtureEvents.length).toBeGreaterThan(0);
    for (const event of fixtureEvents) {
      const parsed = RunEvent.parse(event);
      expect(parsed.kind).toBe(event.kind);
      expect(parsed.seq).toBe(event.seq);
    }
  });

  it("keeps the extra payload fields the SDK sent: server on an mcp tool_call", () => {
    const mcpCall = fixtureEvents.find(
      (e) => e.kind === "tool_call" && String(e.payload.name).startsWith("mcp__"),
    );
    if (!mcpCall) throw new Error("fixtures/runs.json has no mcp__* tool_call");
    const parsed = RunEvent.parse(mcpCall);
    expect(parsed.kind).toBe("tool_call");
    // The payloads are loose on purpose: the SDK adds fields between versions and we store what it sent.
    expect((parsed.payload as Record<string, unknown>).server).toBe("deepwiki");
  });

  it("rejects an event with a kind that is not one of the six", () => {
    expect(RunEvent.safeParse({ ...anEvent("text"), kind: "thinking" }).success).toBe(false);
  });

  it("rejects an event without a seq", () => {
    expect(RunEvent.safeParse(omit(anEvent("text"), "seq")).success).toBe(false);
  });

  it("rejects a tool_call without tool_use_id", () => {
    expect(RunEvent.safeParse(without(anEvent("tool_call"), "tool_use_id")).success).toBe(false);
  });

  it("rejects a tool_call without a name", () => {
    expect(RunEvent.safeParse(without(anEvent("tool_call"), "name")).success).toBe(false);
  });

  it('rejects a tool_result whose is_error is the string "false"', () => {
    expect(RunEvent.safeParse(withField(anEvent("tool_result"), "is_error", "false")).success).toBe(false);
  });

  it("rejects a text event without text", () => {
    expect(RunEvent.safeParse(without(anEvent("text"), "text")).success).toBe(false);
  });

  it("rejects a started event whose mcp_servers entry has no status", () => {
    const started = anEvent("started");
    const broken = withField(started, "mcp_servers", [{ name: "deepwiki" }]);
    expect(RunEvent.safeParse(broken).success).toBe(false);
  });

  it("rejects a finished event without total_cost_usd", () => {
    expect(RunEvent.safeParse(without(anEvent("finished"), "total_cost_usd")).success).toBe(false);
  });
});

// fixtures/runs.json has no plan events yet, so the plan shape is pinned against the design's own example.
const planEvent = {
  seq: 2,
  at: "2026-09-22T09:14:04.000Z",
  kind: "plan",
  payload: {
    intent: "Collect this week's AI news into a CSV",
    expectedOutputs: ["output.csv with title,source,url,published_at,summary"],
    sources: ["web search", "web fetch"],
    steps: [
      { index: 0, title: "Search the web for AI news (7 days)", status: "done" },
      { index: 1, title: "Open the top stories, collect fields", status: "running", note: "3 of 10 read" },
      { index: 2, title: "Write output.csv", status: "pending" },
      { index: 3, title: "Report", status: "pending" },
    ],
  },
};

describe("Plan", () => {
  it("accepts a plan event as the plan tool posts it", () => {
    const parsed = RunEvent.parse(planEvent);
    expect(parsed.kind).toBe("plan");
    expect(Plan.parse(parsed.payload).steps).toHaveLength(4);
  });

  it("carries the agent's reading of the instructions beside the steps", () => {
    const plan = Plan.parse(planEvent.payload);
    expect(plan.intent).toBe("Collect this week's AI news into a CSV");
    expect(plan.expectedOutputs).toHaveLength(1);
    expect(plan.sources).toContain("web search");
  });

  it("accepts a plan with steps only: intent, expectedOutputs and sources default to empty", () => {
    // An agent that posts nothing but steps still leaves a readable plan; the UI shows the empty reading.
    const plan = Plan.parse({ steps: [{ index: 0, title: "Write output.csv", status: "pending" }] });
    expect(plan.intent).toBe("");
    expect(plan.expectedOutputs).toEqual([]);
    expect(plan.sources).toEqual([]);
  });

  it("rejects a plan whose sources is one string, not an array", () => {
    expect(Plan.safeParse({ ...planEvent.payload, sources: "web search" }).success).toBe(false);
  });

  it("rejects a plan whose intent is a number", () => {
    expect(Plan.safeParse({ ...planEvent.payload, intent: 1 }).success).toBe(false);
  });

  it("rejects a plan without steps: the default fields do not make a plan on their own", () => {
    expect(Plan.safeParse({ intent: "Collect AI news", expectedOutputs: [], sources: [] }).success).toBe(
      false,
    );
  });

  it("accepts every status a step can be in", () => {
    for (const status of ["pending", "running", "done", "skipped"]) {
      expect(PlanStepStatus.parse(status)).toBe(status);
    }
  });

  it("rejects a PlanStep with a status of in_progress", () => {
    expect(PlanStep.safeParse({ index: 0, title: "Write output.csv", status: "in_progress" }).success).toBe(
      false,
    );
  });

  it("rejects a PlanStep with an empty title", () => {
    expect(PlanStep.safeParse({ index: 0, title: "", status: "pending" }).success).toBe(false);
  });

  it("rejects a PlanStep with a negative index", () => {
    expect(PlanStep.safeParse({ index: -1, title: "Report", status: "pending" }).success).toBe(false);
  });

  it("rejects a plan event whose payload carries a step that is not a step", () => {
    const broken = { ...planEvent, payload: { steps: ["Search the web"] } };
    expect(RunEvent.safeParse(broken).success).toBe(false);
  });
});

describe("Run", () => {
  it("accepts every run the query stub builds from the fixture", async () => {
    const runs = await listRuns();
    expect(runs.length).toBe(fixtureRuns.length);
    for (const run of runs) expect(Run.parse(run).id).toBe(run.id);
  });

  it("rejects a run whose connectionIds is a string, not an array", async () => {
    const [run] = await listRuns();
    expect(Run.safeParse({ ...run, connectionIds: "conn_deepwiki" }).success).toBe(false);
  });

  it("rejects a run whose costUsd is a string", async () => {
    const [run] = await listRuns();
    expect(Run.safeParse({ ...run, costUsd: "0.1642" }).success).toBe(false);
  });

  it("rejects a run without a createdAt", async () => {
    const [run] = await listRuns();
    expect(Run.safeParse(omit(run, "createdAt")).success).toBe(false);
  });

  it("keeps report and finishedAt null while a run is still going", async () => {
    const runs = await listRuns();
    const running = runs.find((r) => r.status === "running");
    if (!running) throw new Error("fixtures/runs.json has no running run");
    expect(running.report).toBeNull();
    expect(running.finishedAt).toBeNull();
  });
});

describe("FileMeta", () => {
  it("accepts the file metas the query stub returns for a run that wrote one", async () => {
    const { files } = await loadRun("run_01JQ8N4K2W");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(FileMeta.parse(file).name).toBe(file.name);
  });

  it("rejects a file meta whose bytes is a string", () => {
    expect(FileMeta.safeParse({ name: "output.csv", mime: "text/csv", bytes: "2184" }).success).toBe(false);
  });
});

describe("RunState", () => {
  it("accepts the state derived for every fixture run", async () => {
    for (const fixture of fixtureRuns) {
      const { run, events } = await loadRun(fixture.id);
      const state = RunState.parse(deriveState(run, events));
      expect(state.status).toBe(run.status);
      expect(state.maxTurns).toBe(AgentLimits.maxTurns);
    }
  });

  it("rejects a state without connections", async () => {
    const { run, events } = await loadRun("run_01JQ8N4K2W");
    expect(RunState.safeParse(omit(deriveState(run, events), "connections")).success).toBe(false);
  });

  it("rejects a state whose plan is missing rather than null", async () => {
    const { run, events } = await loadRun("run_01JQ8N4K2W");
    expect(RunState.safeParse(omit(deriveState(run, events), "plan")).success).toBe(false);
  });
});

describe("the fixture reads", () => {
  it("listRuns answers an array of Run", async () => {
    expect(z.array(Run).parse(await listRuns())).toHaveLength(fixtureRuns.length);
  });

  it("getRun answers the run, its events and its file metas", async () => {
    const got = await loadRun("run_01JQ8P7T5D");
    Run.parse(got.run);
    z.array(RunEvent).parse(got.events);
    z.array(FileMeta).parse(got.files);
  });

  it("getRun answers null for an id that is not there", async () => {
    expect(await getRun("run_does_not_exist")).toBeNull();
  });

  it("getFile answers the meta with the file's content", async () => {
    const got = await getFile("run_01JQ8N4K2W", "output.csv");
    if (!got) throw new Error("getFile answered null for a file the fixture has");
    FileMeta.parse(got.meta);
    expect(typeof got.content).toBe("string");
  });

  it("getFile answers null for a name the run did not write", async () => {
    expect(await getFile("run_01JQ8N4K2W", "notes.md")).toBeNull();
  });

  it("deriveState answers a RunState without touching the database", async () => {
    const { run, events } = await loadRun("run_01JQ8R2F0C");
    RunState.parse(deriveState(run, events));
  });
});
