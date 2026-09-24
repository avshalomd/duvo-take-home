// The schedule tick against the real automations table. `npm run test:int`. startRun is replaced, so no run and no
// agent ever starts here; what is pinned is the tick's own bookkeeping. Rows live in "int-engine-schedules-<pid>",
// with slots in 2000 and `now` in 2000, so the tick only ever sees this file's automations; deleted after.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { automations } from "@/db/schema";
import { RunLimitError } from "@/lib/runs/limits";

vi.mock("@/lib/runs/start", () => ({ startRun: vi.fn() }));
const { startRun } = await import("@/lib/runs/start");
const { tickSchedules } = await import("./schedules");

const WS = `int-engine-schedules-${process.pid}`; // per process: other worktrees run these tests against the same database
const slot = new Date("2000-01-03T08:00:00Z"); // a Monday
const justAfter = new Date("2000-01-03T08:00:30Z");
const template = { instructions: "[int] Write a note about {input}.", intent: "A note", expectedOutputs: ["note.md"], outputFormat: "", steps: ["Write note.md"], connections: [] };

async function scheduled(what: string, over: Partial<typeof automations.$inferInsert> = {}) {
  const [row] = await db
    .insert(automations)
    .values({ workspaceId: WS, name: `[int] ${what}`, command: `int-${what.replace(/\W+/g, "-")}`, template, status: "active", approvedAt: slot, schedule: "0 8 * * *", scheduleTz: "UTC", scheduleInput: "Acme", nextRunAt: slot, ...over })
    .returning({ id: automations.id });
  return row.id;
}
const row = async (id: string) => (await db.select().from(automations).where(eq(automations.id, id)))[0];

beforeEach(() => vi.mocked(startRun).mockReset());
afterAll(async () => {
  await db.delete(automations).where(eq(automations.workspaceId, WS));
});

// Engine review #6, the owner's call: a scheduled start refused by a limit was only logged; the slot was gone and the
// person saw no run and no reason. The last skip is kept on the automation, and cleared by the next scheduled start.
describe.skipIf(!process.env.DATABASE_URL)("a scheduled run that does not start", () => {
  it("records the slot and the reason in plain words when a limit refuses the start", async () => {
    const id = await scheduled("refused");
    vi.mocked(startRun).mockRejectedValue(new RunLimitError("This workspace has spent its $5.00 budget for today. More can start after 00:00 UTC."));
    await tickSchedules(justAfter);
    const a = await row(id);
    expect(a.lastSkippedAt?.toISOString()).toBe(slot.toISOString());
    expect(a.lastSkippedReason).toBe("This workspace has spent its $5.00 budget for today. More can start after 00:00 UTC.");
    expect(a.nextRunAt?.toISOString()).toBe("2000-01-04T08:00:00.000Z"); // the schedule moved on
  });

  it("clears the last skip when a scheduled run next starts", async () => {
    const id = await scheduled("cleared", { lastSkippedAt: new Date("2000-01-02T08:00:00Z"), lastSkippedReason: "2 runs are already working. Wait for one to finish." });
    vi.mocked(startRun).mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    expect(await tickSchedules(justAfter)).toContain("00000000-0000-4000-8000-000000000001");
    const a = await row(id);
    expect(a.lastSkippedAt).toBeNull();
    expect(a.lastSkippedReason).toBeNull();
  });

  it("skips a slot over an hour late without a run, and records why", async () => {
    const id = await scheduled("late");
    await tickSchedules(new Date("2000-01-03T15:00:00Z")); // the tick comes back seven hours after the slot
    expect(startRun).not.toHaveBeenCalled();
    const a = await row(id);
    expect(a.lastSkippedAt?.toISOString()).toBe(slot.toISOString());
    expect(a.lastSkippedReason).toBe("Schedules were not being checked at that time.");
    expect(a.nextRunAt?.toISOString()).toBe("2000-01-04T08:00:00.000Z");
  });
});
