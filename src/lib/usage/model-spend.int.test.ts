// Check again and Make an automation against the real tables (QA F18, security review S10): each is limited, and what
// its model calls cost counts toward the workspace's "spent today" and the deployment's cap. `npm run test:int`.
// Its own workspaces ("int-model-spend*"), deleted afterwards: the database is shared with other agents.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, transaction } from "@/db";
import { modelSpend, runs, workspaceSettings } from "@/db/schema";
import { DEFAULT_LIMITS, getUsage, healBudgetStop, updateLimits } from "./budget";
import { deploymentSpentToday } from "./deployment-budget";
import { reportModelUsage } from "./meter";
import { payForModelCall, SpendLimitError } from "./model-spend";

const WS = "int-model-spend";
const OTHER = "int-model-spend-other";
const BROKE = "int-model-spend-broke";
const ALL = [WS, OTHER, BROKE];
const RUN_A = "0f0e0d0c-0b0a-4909-8807-060504030201";
const RUN_B = "1f1e1d1c-1b1a-4919-8817-161514131211";

// $0.50 of Claude Sonnet 5 (250,000 tokens read at $2 per million), as a judge and a reviewer would report it
const halfADollar = async () => {
  reportModelUsage({ modelId: "claude-sonnet-5", inputTokens: 250_000, outputTokens: 0 });
  return "checked";
};

async function clean() {
  await db.delete(modelSpend).where(inArray(modelSpend.workspaceId, ALL));
  await db.delete(runs).where(inArray(runs.workspaceId, ALL));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, ALL));
}
beforeEach(clean);
afterAll(clean);

describe.skipIf(!process.env.DATABASE_URL)("payForModelCall: Check again and Make an automation", () => {
  it("counts what the work's model calls cost in the workspace's spend today, and hands back its answer", async () => {
    const before = (await getUsage(WS)).costTodayUsd;
    expect(await payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", halfADollar)).toBe("checked");
    expect((await getUsage(WS)).costTodayUsd).toBeCloseTo(before + 0.5, 5);
    expect((await getUsage(OTHER)).costTodayUsd).toBe(0); // another workspace's day is its own
  });

  it("counts it in the deployment's spend for today too", async () => {
    const before = await transaction((tx) => deploymentSpentToday(tx, new Date()));
    await payForModelCall({ workspaceId: WS, runId: RUN_A }, "draft", halfADollar);
    const after = await transaction((tx) => deploymentSpentToday(tx, new Date()));
    expect(after - before).toBeCloseTo(0.5, 5);
  });

  it("counts it before a run pays for another fix attempt", async () => {
    await updateLimits(WS, { ...DEFAULT_LIMITS, dailyBudgetUsd: 1 });
    expect(await healBudgetStop(WS, RUN_B, 0)).toBeNull(); // $1 left: one fix may cost up to $1
    await payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", halfADollar);
    expect(await healBudgetStop(WS, RUN_B, 0)).toMatch(/left of its \$1\.00 budget/);
  });

  it("records what was spent when the work fails, and passes the failure on", async () => {
    const failing = async () => {
      reportModelUsage({ modelId: "claude-sonnet-5", inputTokens: 250_000, outputTokens: 0 });
      throw new Error("The check could not be run again");
    };
    const err = await payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", failing).catch((e) => e);
    expect(err.message).toBe("The check could not be run again");
    expect((await getUsage(WS)).costTodayUsd).toBeCloseTo(0.5, 5);
  });

  it("checks one run again once a minute, and says when to try again; another run of the workspace is not held up", async () => {
    await payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", halfADollar);
    let asked = false;
    const again = await payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", async () => void (asked = true)).catch((e) => e);
    expect(again).toBeInstanceOf(SpendLimitError);
    expect(again.message).toMatch(/^This result was checked a moment ago\. Try again in \d+ seconds?\.$/);
    expect(asked).toBe(false); // the model is never asked
    expect(await payForModelCall({ workspaceId: WS, runId: RUN_B }, "recheck", halfADollar)).toBe("checked");
  });

  it("lets only one of two presses at the same moment through", async () => {
    let calls = 0;
    const work = async () => void calls++;
    const results = await Promise.allSettled([
      payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", work),
      payForModelCall({ workspaceId: WS, runId: RUN_A }, "recheck", work),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("drafts three automations per workspace every 10 minutes, then refuses in plain words; another workspace is not held up", async () => {
    for (let i = 0; i < 3; i++) await payForModelCall({ workspaceId: WS, runId: RUN_A }, "draft", halfADollar);
    const fourth = await payForModelCall({ workspaceId: WS, runId: RUN_B }, "draft", halfADollar).catch((e) => e);
    expect(fourth).toBeInstanceOf(SpendLimitError);
    expect(fourth.message).toBe("This workspace has drafted 3 automations in the last 10 minutes. Try again in about 10 minutes.");
    expect(await payForModelCall({ workspaceId: OTHER, runId: RUN_A }, "draft", halfADollar)).toBe("checked");
  });

  it("asks no model once the workspace has spent its budget for today", async () => {
    await updateLimits(BROKE, { ...DEFAULT_LIMITS, dailyBudgetUsd: 1 });
    await db.insert(runs).values({ workspaceId: BROKE, prompt: "[int] spent the day", status: "succeeded", model: "test", costUsd: 1 });
    let asked = false;
    const err = await payForModelCall({ workspaceId: BROKE, runId: RUN_A }, "recheck", async () => void (asked = true)).catch((e) => e);
    expect(err).toBeInstanceOf(SpendLimitError);
    expect(err.message).toBe("This workspace has spent its $1.00 budget for today. Try again after 00:00 UTC.");
    expect(asked).toBe(false);
  });
});
