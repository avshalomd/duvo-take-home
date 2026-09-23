// Re-evaluate against the real database (the open v1 item): the run, its events and its files are loaded from the
// rows, handed to a stubbed evaluator, and the verdict is written back on the run. `npm run test:int`
// Everything it creates is named "[int] ..." and deleted in afterAll, because the database is shared.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput, Verdict } from "@/contracts/eval";
import { db, schema } from "@/db";
import { followUpInstructions } from "@/lib/agent/follow-up-prompt";
import { loadRun, reevaluate, saveVerdict } from "./reevaluate";

const WS = "[int] eval workspace";
const template: AutomationTemplate = {
  instructions: "[int] Find the news about {input} and save it to news.csv.",
  intent: "[int] news digest",
  expectedOutputs: ["news.csv"],
  outputFormat: "",
  steps: ["Search the web for news about {input}", "Write news.csv"],
  connections: [],
};
const plan = (status: "pending" | "done") => ({ intent: "[int] news", expectedOutputs: ["news.csv"], sources: ["web search"], steps: [{ index: 0, title: "Search the web for news about Acme", status }] });
const verdict: Verdict = {
  verdict: "pass",
  checks: [{ id: "completed", label: "The run finished", ok: true, detail: "succeeded" }],
  judgment: { answeredQuery: 0.93, followedPlan: 0.9 },
  review: null,
  reasons: [],
  evaluatedAt: "2026-09-22T08:03:00.000Z",
  decidedBy: "judge",
  path: ["checks", "judge"],
};

const runIds: string[] = [];
const automationIds: string[] = [];

async function insertRun(over: Partial<typeof schema.runs.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.runs)
    .values({
      workspaceId: WS,
      prompt: "[int] Find the news about Acme and save it to news.csv.",
      status: "succeeded",
      model: "claude-sonnet-5",
      report: "Wrote news.csv with two stories.",
      createdAt: new Date("2026-09-22T08:00:00.000Z"),
      finishedAt: new Date("2026-09-22T08:02:00.000Z"),
      ...over,
    })
    .returning({ id: schema.runs.id });
  runIds.push(row.id);
  const at = new Date("2026-09-22T08:01:00.000Z");
  await db.insert(schema.runEvents).values([
    { runId: row.id, seq: 1, kind: "plan", payload: plan("pending"), at },
    { runId: row.id, seq: 2, kind: "tool_call", payload: { tool_use_id: "t1", name: "WebSearch", input: { query: "Acme" } }, at },
    { runId: row.id, seq: 3, kind: "tool_call", payload: { tool_use_id: "t2", name: "Write", input: { file_path: "news.csv" } }, at },
    { runId: row.id, seq: 4, kind: "plan", payload: plan("done"), at },
  ]);
  await db.insert(schema.files).values({ runId: row.id, name: "news.csv", mime: "text/csv", bytes: 30, content: "title,url\nA,https://a.example\n" });
  return row.id;
}

async function insertAutomation(version: number) {
  const [row] = await db
    .insert(schema.automations)
    .values({ workspaceId: WS, name: "[int] news digest", command: `int-eval-${Date.now().toString(36)}-${automationIds.length}`, template, version })
    .returning({ id: schema.automations.id });
  automationIds.push(row.id);
  return row.id;
}

const evaluated = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[0][0] as EvaluateInput;

describe.skipIf(!process.env.DATABASE_URL)("reevaluateRun's database path", () => {
  let plainRun: string;

  beforeAll(async () => {
    plainRun = await insertRun();
  });

  afterAll(async () => {
    if (runIds.length) {
      await db.delete(schema.runEvents).where(inArray(schema.runEvents.runId, runIds));
      await db.delete(schema.files).where(inArray(schema.files.runId, runIds));
      await db.delete(schema.runs).where(inArray(schema.runs.id, runIds));
    }
    if (automationIds.length) await db.delete(schema.automations).where(inArray(schema.automations.id, automationIds));
  });

  it("loads the run with its last plan, its tools and its files, and dates it by when it finished", async () => {
    const evaluate = vi.fn(async () => verdict);
    await reevaluate(plainRun, { load: loadRun, evaluate, save: saveVerdict });
    const input = evaluated(evaluate);
    expect(input.prompt).toMatch(/^\[int\]/);
    expect(input.plan?.steps[0].status).toBe("done");
    expect(input.toolsUsed).toEqual(["WebSearch", "Write"]);
    expect(input.files).toEqual([{ name: "news.csv", content: "title,url\nA,https://a.example\n" }]);
    expect(input.today).toBe("2026-09-22");
    expect(input.template ?? null).toBeNull(); // a free-text run is not held to any automation
  });

  it("stores the new verdict on the run, whole, including why it was decided", async () => {
    await reevaluate(plainRun, { load: loadRun, evaluate: async () => verdict, save: saveVerdict });
    const [row] = await db.select({ verdict: schema.runs.verdict }).from(schema.runs).where(eq(schema.runs.id, plainRun));
    expect(row.verdict).toEqual(verdict);
  });

  it("says which run is missing when the id is not in the database", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const evaluate = vi.fn(async () => verdict);
    await expect(reevaluate(missing, { load: loadRun, evaluate, save: saveVerdict })).rejects.toThrow(missing);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("re-evaluates a run of a saved automation against the automation's template", async () => {
    const automationId = await insertAutomation(1);
    const runId = await insertRun({ automationId, automationVersion: 1, purpose: "automation", input: "Acme" });
    const evaluate = vi.fn(async () => verdict);
    await reevaluate(runId, { load: loadRun, evaluate, save: saveVerdict });
    expect(evaluated(evaluate).template).toEqual(template);
  });

  // Q85: a follow-up's own prompt is only the change ("Add a summary column"). The live run was judged against the
  // parent's instructions plus the change; Re-evaluate must judge the same brief, or it drops the column, freshness
  // and file checks and overwrites a good verdict with a worse one.
  it("judges a follow-up against the thread's instructions and the change, as the live run was judged", async () => {
    const [parent] = await db.select({ prompt: schema.runs.prompt }).from(schema.runs).where(eq(schema.runs.id, plainRun));
    const change = "[int] Add a summary column";
    const followUp = await insertRun({ purpose: "followup", parentRunId: plainRun, prompt: change });
    const evaluate = vi.fn(async () => verdict);
    await reevaluate(followUp, { load: loadRun, evaluate, save: saveVerdict });
    expect(evaluated(evaluate).prompt).toBe(followUpInstructions(parent.prompt, change));
  });

  it("walks a thread of follow-ups back to the first instructions, each change in order", async () => {
    const first = await insertRun({ purpose: "followup", parentRunId: plainRun, prompt: "[int] Add a summary column" });
    const second = await insertRun({ purpose: "followup", parentRunId: first, prompt: "[int] Sort by date" });
    const evaluate = vi.fn(async () => verdict);
    await reevaluate(second, { load: loadRun, evaluate, save: saveVerdict });
    const prompt = evaluated(evaluate).prompt;
    expect(prompt.startsWith("[int] Find the news about Acme")).toBe(true);
    expect(prompt.indexOf("Add a summary column")).toBeLessThan(prompt.indexOf("Sort by date"));
  });

  it("leaves the template out when the automation was edited after the run: the run followed an older version", async () => {
    const automationId = await insertAutomation(2);
    const runId = await insertRun({ automationId, automationVersion: 1, purpose: "automation", input: "Acme" });
    const evaluate = vi.fn(async () => verdict);
    await reevaluate(runId, { load: loadRun, evaluate, save: saveVerdict });
    expect(evaluated(evaluate).template ?? null).toBeNull();
  });
});
