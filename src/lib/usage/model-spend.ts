import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, transaction, type Tx } from "@/db";
import { modelSpend } from "@/db/schema";
import { getLimits, getUsage } from "./budget";
import { deploymentDailyBudget, deploymentSpentToday } from "./deployment-budget";
import { metered } from "./meter";
import { SpendLimitError } from "./spend-error";
import { DRAFTS_WINDOW_MS, RECHECK_EVERY_MS, draftRefusal, recheckRefusal, spentRefusal } from "./spend-rule";

export { SpendLimitError };

export type SpendKind = "recheck" | "draft";

/**
 * A paid model call outside a run - Check again, or Make an automation - behind its limit and inside the day's money
 * (QA F18, security review S10). Under one lock per workspace: the day's spend is checked, then the limit is counted
 * and the press recorded, so two presses at the same moment cannot both pass. Then the work runs, metered, and its
 * row is given what its model calls cost, which from then on counts in "Spent today" and the deployment's cap.
 * Throws SpendLimitError, in plain words, when the press is refused; the model is then never asked.
 */
export async function payForModelCall<T>(ctx: { workspaceId: string; runId: string }, kind: SpendKind, work: () => Promise<T>): Promise<T> {
  const [limits, usage] = await Promise.all([getLimits(ctx.workspaceId), getUsage(ctx.workspaceId)]);
  const id = await transaction(async (tx) => {
    // its own key space ("model-spend:"), so it never waits on a run start's workspace lock
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`model-spend:${ctx.workspaceId}`}))`);
    const now = new Date();
    const money = spentRefusal({
      workspaceSpentUsd: usage.costTodayUsd,
      workspaceBudgetUsd: limits.dailyBudgetUsd,
      deploymentSpentUsd: await deploymentSpentToday(tx, now),
      deploymentBudgetUsd: deploymentDailyBudget(),
      resetsAt: usage.resetsAt,
    });
    if (money) throw new SpendLimitError(money);
    const refusal = kind === "recheck" ? recheckRefusal(await lastRecheck(tx, ctx, now), now) : draftRefusal(await recentDrafts(tx, ctx.workspaceId, now), now);
    if (refusal) throw new SpendLimitError(refusal);
    const [row] = await tx.insert(modelSpend).values({ workspaceId: ctx.workspaceId, runId: ctx.runId, kind }).returning({ id: modelSpend.id });
    return row.id;
  });
  return metered(work, async (costUsd) => {
    await db.update(modelSpend).set({ costUsd }).where(eq(modelSpend.id, id));
  });
}

async function lastRecheck(tx: Tx, ctx: { workspaceId: string; runId: string }, now: Date): Promise<Date | null> {
  const [row] = await tx
    .select({ at: modelSpend.createdAt })
    .from(modelSpend)
    .where(
      and(
        eq(modelSpend.workspaceId, ctx.workspaceId),
        eq(modelSpend.runId, ctx.runId),
        eq(modelSpend.kind, "recheck"),
        gte(modelSpend.createdAt, new Date(now.getTime() - RECHECK_EVERY_MS)),
      ),
    )
    .orderBy(desc(modelSpend.createdAt))
    .limit(1);
  return row?.at ?? null;
}

async function recentDrafts(tx: Tx, workspaceId: string, now: Date): Promise<Date[]> {
  const rows = await tx
    .select({ at: modelSpend.createdAt })
    .from(modelSpend)
    .where(and(eq(modelSpend.workspaceId, workspaceId), eq(modelSpend.kind, "draft"), gte(modelSpend.createdAt, new Date(now.getTime() - DRAFTS_WINDOW_MS))));
  return rows.map((r) => r.at);
}
