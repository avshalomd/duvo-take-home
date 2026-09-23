// Limits and today's usage against the real tables. `npm run test:int`. Its own workspaces ("int-settings-budget*"),
// deleted afterwards, because the database is shared with other agents.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { runs, workspaceSettings } from "@/db/schema";
import { DEFAULT_LIMITS, checkBudget, getLimits, getUsage, healBudgetStop, updateLimits } from "./budget";
import { startOfUtcDay } from "./budget-rule";

const WS = "int-settings-budget";
const FRESH = "int-settings-budget-fresh";
const OTHER = "int-settings-budget-other";
const HEAL = "int-settings-budget-heal";
const ALL = [WS, FRESH, OTHER, HEAL];

afterAll(async () => {
  await db.delete(runs).where(inArray(runs.workspaceId, ALL));
  await db.delete(workspaceSettings).where(inArray(workspaceSettings.workspaceId, ALL));
});

async function addRun(workspaceId: string, status: string, costUsd: number | null, createdAt = new Date()) {
  await db.insert(runs).values({ workspaceId, prompt: "[int] budget", status, model: "test", costUsd, createdAt });
}

describe.skipIf(!process.env.DATABASE_URL)("workspace limits and usage", () => {
  it("answers the defaults for a workspace that never saved limits, and stores them", async () => {
    expect(await getLimits(FRESH)).toEqual(DEFAULT_LIMITS);
    const [row] = await db.select().from(workspaceSettings).where(eq(workspaceSettings.workspaceId, FRESH));
    expect(row).toBeDefined();
  });

  it("saves every limit and reads it back", async () => {
    const limits = { dailyBudgetUsd: 2.5, dailyRunLimit: 12, maxInFlight: 2, stepChecks: false, strictConnections: true, deniedDomains: ["pastebin.com"], autoHealAttempts: 1 };
    await updateLimits(WS, limits);
    expect(await getLimits(WS)).toEqual(limits);
  });

  it("counts today's runs, their cost and the runs still working, in this workspace only", async () => {
    await addRun(WS, "succeeded", 0.25);
    await addRun(WS, "running", 0.1);
    await addRun(WS, "queued", null); // not finished: no cost yet, still a run of today
    await addRun(WS, "failed", 0.05);
    await addRun(WS, "succeeded", 3, new Date(startOfUtcDay(new Date()).getTime() - 3_600_000)); // yesterday: not counted
    await addRun(OTHER, "running", 1); // another workspace: not counted

    const usage = await getUsage(WS);
    expect(usage.runsToday).toBe(4);
    expect(usage.costTodayUsd).toBeCloseTo(0.4, 5);
    expect(usage.inFlight).toBe(2);
    expect(new Date(usage.resetsAt).toISOString()).toMatch(/T00:00:00\.000Z$/);
  });

  it("refuses a start once the day's runs are used, in plain words", async () => {
    await updateLimits(WS, { ...(await getLimits(WS)), dailyRunLimit: 4, maxInFlight: 10 });
    expect(await checkBudget(WS)).toBe("This workspace has used its 4 runs for today. More can start after 00:00 UTC.");
  });

  it("asks to wait while as many runs are working as the workspace allows", async () => {
    await updateLimits(WS, { ...(await getLimits(WS)), dailyRunLimit: 100, maxInFlight: 2 });
    expect(await checkBudget(WS)).toBe("2 runs are already working. Wait for one to finish.");
  });

  it("lets a run start when there is room", async () => {
    await updateLimits(WS, { ...(await getLimits(WS)), dailyRunLimit: 100, maxInFlight: 5, dailyBudgetUsd: 10 });
    expect(await checkBudget(WS)).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("healBudgetStop: may a run pay for another fix attempt?", () => {
  it("counts the workspace's other runs today and this run's own spend so far, its row's stale cost not twice", async () => {
    await updateLimits(HEAL, { ...DEFAULT_LIMITS, dailyBudgetUsd: 1 });
    await addRun(HEAL, "succeeded", 0.6); // another run today
    const [mine] = await db.insert(runs).values({ workspaceId: HEAL, prompt: "[int] budget", status: "evaluating", model: "test", costUsd: 0.3 }).returning({ id: runs.id });

    expect(await healBudgetStop(HEAL, mine.id, 0.3)).toBeNull(); // 0.9 of 1
    expect(await healBudgetStop(HEAL, mine.id, 0.45)).toBe("The workspace's $1.00 budget for today is spent, so healing stopped here.");
  });
});
