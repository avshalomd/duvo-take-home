// Which scheduled automations a tick would fire, against the real tables. `npm run test:int`. Nothing is fired: the
// test reads the candidates only (a real run costs money). The rows are due in the year 2100, so a worker or a cron
// tick running against this database today never sees them as due; they are deleted in afterAll.
import { afterAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { automations, organization } from "@/db/schema";
import { dueAutomations } from "./schedules";

const suffix = crypto.randomUUID().slice(0, 8);
const LIVE_WS = `int-sched-live-${suffix}`;
const GONE_WS = `int-sched-gone-${suffix}`; // no organization row: a workspace deleted underneath its automations
const DUE = new Date("2100-01-01T08:00:00Z");
const NOW = new Date("2100-01-01T09:00:00Z");

async function scheduled(workspaceId: string, command: string): Promise<string> {
  const [row] = await db
    .insert(automations)
    .values({
      workspaceId,
      name: "[int] scheduled",
      command,
      template: { instructions: "[int] Summarise {input}.", intent: "", expectedOutputs: ["summary.md"], outputFormat: "", steps: ["Write it"], connections: [] },
      status: "active",
      schedule: "0 8 * * *",
      scheduleInput: "news",
      scheduleTz: "UTC",
      nextRunAt: DUE,
    })
    .returning({ id: automations.id });
  return row.id;
}

afterAll(async () => {
  await db.delete(automations).where(inArray(automations.workspaceId, [LIVE_WS, GONE_WS]));
  await db.delete(organization).where(inArray(organization.id, [LIVE_WS]));
});

describe.skipIf(!process.env.DATABASE_URL)("dueAutomations", () => {
  // Security review S4 / QA F4: a workspace deleted underneath an active schedule kept starting paid runs nobody could see
  it("finds a due schedule of a workspace that exists, and never one of a workspace that is gone", async () => {
    await db.insert(organization).values({ id: LIVE_WS, name: "[int] scheduled workspace", slug: LIVE_WS, createdAt: new Date() });
    const live = await scheduled(LIVE_WS, "int-live");
    const orphan = await scheduled(GONE_WS, "int-orphan");

    const due = (await dueAutomations(NOW)).map((a) => a.id);

    expect(due).toContain(live);
    expect(due).not.toContain(orphan);
  });
});
