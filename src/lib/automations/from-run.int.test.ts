// draftFromRun against the real tables, with a fake drafter in place of the model. `npm run test:int`.
// Everything lives in the "int-automations-draft" workspace and is deleted in afterAll.
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automations, runs } from "@/db/schema";
import type { AutomationDraft } from "@/contracts/automation";
import { followUpInstructions } from "@/lib/agent/follow-up-prompt";
import { draftFromRun } from "./from-run";

const WS = "int-automations-draft";
const ctx = { workspaceId: WS, userId: "int-user" };

async function finishedRun(): Promise<string> {
  const [row] = await db
    .insert(runs)
    .values({ workspaceId: WS, prompt: "[int] Audit Acme Ltd and write audit.md", status: "succeeded", model: "int-test" })
    .returning({ id: runs.id });
  return row.id;
}

const draft = (command: string): AutomationDraft => ({
  name: "[int] Company audit",
  command,
  description: "Audits a company",
  inputLabel: "Company name",
  inputHint: "",
  inputExample: "Acme Ltd",
  template: { instructions: "[int] Audit {input}.", intent: "", expectedOutputs: ["audit.md"], outputFormat: "", steps: ["Write audit.md"], connections: [] },
});
const after = (ms: number, command: string) => () => new Promise<AutomationDraft>((resolve) => setTimeout(() => resolve(draft(command)), ms));

afterAll(async () => {
  await db.delete(automations).where(eq(automations.workspaceId, WS));
  await db.delete(runs).where(eq(runs.workspaceId, WS));
});

describe.skipIf(!process.env.DATABASE_URL)("draftFromRun (Q119: one draft per press)", () => {
  it("reuses the draft made from the same run a moment ago instead of asking the model again", async () => {
    const runId = await finishedRun();
    let calls = 0;
    const drafter = async () => {
      calls += 1;
      return draft("int-once");
    };
    const first = await draftFromRun(ctx, runId, drafter);
    const second = await draftFromRun(ctx, runId, drafter);
    expect(second.id).toBe(first.id);
    expect(calls).toBe(1);
  });

  // A follow-up's own prompt is only the change: "Make the bars horizontal" drafted an automation of that alone.
  it("drafts from a follow-up's whole instructions: the first brief and the change, not the change alone", async () => {
    const [parent] = await db
      .insert(runs)
      .values({ workspaceId: WS, prompt: "[int] Chart the five largest EU countries by population", status: "succeeded", model: "int-test" })
      .returning({ id: runs.id });
    const [followUp] = await db
      .insert(runs)
      .values({ workspaceId: WS, prompt: "Make the bars horizontal", status: "succeeded", model: "int-test", purpose: "followup", parentRunId: parent.id })
      .returning({ id: runs.id });
    const seen: string[] = [];
    await draftFromRun(ctx, followUp.id, async (run) => {
      seen.push(run.prompt);
      return draft("int-thread");
    });
    expect(seen).toEqual([followUpInstructions("[int] Chart the five largest EU countries by population", "Make the bars horizontal")]);
  });

  it("keeps one draft when a reload starts a second one while the first is still being written", async () => {
    const runId = await finishedRun();
    const [a, b] = await Promise.all([draftFromRun(ctx, runId, after(50, "int-race")), draftFromRun(ctx, runId, after(600, "int-race"))]);
    expect(b.id).toBe(a.id);
    const rows = await db.select({ id: automations.id }).from(automations).where(eq(automations.createdFromRunId, runId));
    expect(rows).toHaveLength(1);
  });
});
