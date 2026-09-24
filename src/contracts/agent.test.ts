import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AgentLimits, SetPlanInput, StartRunInput, UpdateStepInput } from "./agent";
import { Plan, RunEvent } from "./run";
import { mapMessage } from "../lib/agent/map-message";
import promptsFixture from "../../fixtures/prompts.json";

type FixturePrompt = { id: string; label: string; text: string };
const fixturePrompts = promptsFixture as unknown as FixturePrompt[];

// The plan tool takes raw Zod shapes, because the SDK's tool() wants a shape rather than a z.object.
const SetPlan = z.object(SetPlanInput);
const UpdateStep = z.object(UpdateStepInput);

/** The same object without one key, so a rejection names that key and nothing else. */
function omit<T extends object>(value: T, key: keyof T & string) {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy;
}

describe("StartRunInput", () => {
  it("accepts every prompt in fixtures/prompts.json", () => {
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
  // The agent has to state what it understood before it acts: free text in, so a wrong reading shows early.
  const setPlan = {
    intent: "Collect this week's AI news into a CSV",
    expectedOutputs: ["output.csv with title,source,url,published_at,summary"],
    sources: ["web search", "web fetch"],
    steps,
  };

  it("accepts the reading and the titles the agent posts before it does anything else", () => {
    const parsed = SetPlan.parse(setPlan);
    expect(parsed.intent).toBe(setPlan.intent);
    expect(parsed.steps).toHaveLength(4);
  });

  it("accepts an empty sources list: not every run uses a connection or the web", () => {
    expect(SetPlan.parse({ ...setPlan, sources: [] }).sources).toEqual([]);
  });

  it("turns into the Plan the UI reads: the reading, then one pending step per title", () => {
    const posted = SetPlan.parse(setPlan);
    const plan = Plan.parse({
      intent: posted.intent,
      expectedOutputs: posted.expectedOutputs,
      sources: posted.sources,
      steps: posted.steps.map((title, index) => ({ index, title, status: "pending" })),
    });
    expect(plan.intent).toBe(setPlan.intent);
    expect(plan.steps[3]).toEqual({ index: 3, title: "Report", status: "pending" });
  });

  it("rejects a set_plan without intent: the plan tool has no default, the agent must say it", () => {
    expect(SetPlan.safeParse(omit(setPlan, "intent")).success).toBe(false);
  });

  it("rejects an empty intent", () => {
    expect(SetPlan.safeParse({ ...setPlan, intent: "" }).success).toBe(false);
  });

  it("rejects an empty expectedOutputs: the agent has to name what it will produce", () => {
    expect(SetPlan.safeParse({ ...setPlan, expectedOutputs: [] }).success).toBe(false);
  });

  it("rejects a sources that is one string, not an array", () => {
    expect(SetPlan.safeParse({ ...setPlan, sources: "web search" }).success).toBe(false);
  });

  it("rejects an empty steps array: a plan of nothing is not a plan", () => {
    expect(SetPlan.safeParse({ ...setPlan, steps: [] }).success).toBe(false);
  });

  it("rejects an empty step title", () => {
    expect(SetPlan.safeParse({ ...setPlan, steps: ["Search the web", ""] }).success).toBe(false);
  });

  it("rejects more than 12 steps", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => `Step ${i}`);
    expect(SetPlan.safeParse({ ...setPlan, steps: thirteen }).success).toBe(false);
  });
});

describe("UpdateStepInput", () => {
  it("accepts a step going to running, and to done with a note", () => {
    expect(UpdateStep.parse({ index: 1, status: "running" }).note).toBeUndefined();
    expect(UpdateStep.parse({ index: 1, status: "done", note: "no results, tried RSS" }).note).toBe(
      "no results, tried RSS",
    );
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
  // qa-ai F12 (the owner's call): /news-digest used 24 of 25 turns, so 40 leaves room; the $1 still caps what it costs.
  it("caps a runaway run on turns, money and wall clock, with room for a digest that searches a lot", () => {
    expect(AgentLimits.maxTurns).toBe(40);
    expect(AgentLimits.maxBudgetUsd).toBe(1);
    expect(AgentLimits.wallClockMs).toBeLessThan(300_000); // under the route's maxDuration, so we time out first
  });

  it("serves only the three text extensions the agent may write", () => {
    expect([...AgentLimits.fileExtensions]).toEqual([".txt", ".md", ".csv"]);
  });
});

describe("the agent stubs", () => {
  it("mapMessage answers RunEvent[] for an SDK message", () => {
    const events = z
      .array(RunEvent)
      .parse(mapMessage({ type: "assistant", message: { content: [] } }, 1, "2026-09-22T09:14:06.441Z"));
    expect(events).toEqual([]); // STUB: the engine package maps the message kinds
  });


});
