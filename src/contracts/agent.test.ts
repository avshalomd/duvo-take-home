import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentLimits, SetPlanInput, StartRunInput, UpdateStepInput } from "./agent";
import { Plan, RunEvent } from "./run";
import { mapMessage } from "../lib/agent/map-message";
import { runAutomation } from "../lib/agent/run";
import { startRun } from "../lib/runs/start";
import promptsFixture from "../../fixtures/prompts.json";

type FixturePrompt = { id: string; label: string; text: string };
const fixturePrompts = promptsFixture as unknown as FixturePrompt[];

// The plan tool takes raw Zod shapes, because the SDK's tool() wants a shape rather than a z.object.
const SetPlan = z.object(SetPlanInput);
const UpdateStep = z.object(UpdateStepInput);

describe("StartRunInput", () => {
  it("accepts every preset prompt in fixtures/prompts.json", () => {
    expect(fixturePrompts.length).toBeGreaterThan(0);
    for (const p of fixturePrompts) expect(StartRunInput.parse({ prompt: p.text }).prompt).toBe(p.text);
  });

  it("trims what the textarea sends", () => {
    const text = fixturePrompts[0].text;
    expect(StartRunInput.parse({ prompt: `  ${text}\n` }).prompt).toBe(text);
  });

  it("rejects a prompt under 10 characters", () => {
    expect(StartRunInput.safeParse({ prompt: "a csv" }).success).toBe(false);
  });

  it("rejects a prompt that is only whitespace", () => {
    expect(StartRunInput.safeParse({ prompt: "              " }).success).toBe(false);
  });

  it("rejects a prompt over 4000 characters", () => {
    expect(StartRunInput.safeParse({ prompt: "a".repeat(4001) }).success).toBe(false);
  });

  it("rejects an input without a prompt", () => {
    expect(StartRunInput.safeParse({}).success).toBe(false);
  });
});

describe("SetPlanInput", () => {
  const steps = [
    "Search the web for AI news (7 days)",
    "Open the top stories, collect fields",
    "Write output.csv",
    "Report",
  ];

  it("accepts the titles the agent posts before it does anything else", () => {
    expect(SetPlan.parse({ steps }).steps).toHaveLength(4);
  });

  it("turns into the Plan the UI reads: one pending step per title", () => {
    const plan = Plan.parse({
      steps: SetPlan.parse({ steps }).steps.map((title, index) => ({ index, title, status: "pending" })),
    });
    expect(plan.steps[3]).toEqual({ index: 3, title: "Report", status: "pending" });
  });

  it("rejects an empty steps array: a plan of nothing is not a plan", () => {
    expect(SetPlan.safeParse({ steps: [] }).success).toBe(false);
  });

  it("rejects an empty step title", () => {
    expect(SetPlan.safeParse({ steps: ["Search the web", ""] }).success).toBe(false);
  });

  it("rejects more than 12 steps", () => {
    expect(SetPlan.safeParse({ steps: Array.from({ length: 13 }, (_, i) => `Step ${i}`) }).success).toBe(false);
  });
});

describe("UpdateStepInput", () => {
  it("accepts a step going to running, and to done with a note", () => {
    expect(UpdateStep.parse({ index: 1, status: "running" }).note).toBeUndefined();
    expect(UpdateStep.parse({ index: 1, status: "done", note: "no results, tried RSS" }).note).toBe("no results, tried RSS");
  });

  it("rejects a status of in_progress: the four PlanStep statuses are the whole vocabulary", () => {
    expect(UpdateStep.safeParse({ index: 1, status: "in_progress" }).success).toBe(false);
  });

  it("rejects a negative index", () => {
    expect(UpdateStep.safeParse({ index: -1, status: "done" }).success).toBe(false);
  });

  it("rejects an update without an index", () => {
    expect(UpdateStep.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("AgentLimits", () => {
  it("caps a runaway run on turns, money and wall clock", () => {
    expect(AgentLimits.maxTurns).toBe(25);
    expect(AgentLimits.maxBudgetUsd).toBe(1);
    expect(AgentLimits.wallClockMs).toBeLessThan(300_000); // under the route's maxDuration, so we time out first
  });

  it("serves only the three text extensions the agent may write", () => {
    expect([...AgentLimits.fileExtensions]).toEqual([".txt", ".md", ".csv"]);
  });
});

describe("the agent stubs", () => {
  it("mapMessage answers RunEvent[] for an SDK message", () => {
    const events = z.array(RunEvent).parse(mapMessage({ type: "assistant", message: { content: [] } }, 1, "2026-09-22T09:14:06.441Z"));
    expect(events).toEqual([]); // STUB: the engine package maps the message kinds
  });

  it("startRun is not implemented yet and says so", async () => {
    await expect(startRun({ prompt: fixturePrompts[0].text })).rejects.toThrow("not implemented: startRun");
  });

  it("runAutomation is not implemented yet and says so", async () => {
    await expect(runAutomation("run_01JQ8N4K2W")).rejects.toThrow("not implemented: runAutomation");
  });
});
