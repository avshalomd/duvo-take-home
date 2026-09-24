import { and, eq, gte, sum } from "drizzle-orm";
import type { Tx } from "@/db";
import { modelSpend } from "@/db/schema";
import { startOfUtcDay } from "./budget-rule";

// Any connection that can select: the HTTP `db` (budget.ts) or a start's transaction (deployment-budget.ts). Taken
// as a parameter, so this file imports no database client and the budget modules can share it without a cycle.
type Conn = Pick<Tx, "select">;

/** What today's checks and drafts cost (QA F18): one workspace's, or every workspace's (null) for the deployment's cap. */
export async function modelSpendToday(conn: Conn, workspaceId: string | null, now: Date): Promise<number> {
  const today = gte(modelSpend.createdAt, startOfUtcDay(now));
  const [row] = await conn
    .select({ usd: sum(modelSpend.costUsd) })
    .from(modelSpend)
    .where(workspaceId === null ? today : and(today, eq(modelSpend.workspaceId, workspaceId)));
  return Number(row.usd ?? 0); // sum() of a real arrives as a string, or null for no rows
}
