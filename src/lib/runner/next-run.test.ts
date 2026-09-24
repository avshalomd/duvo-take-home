import { describe, expect, it } from "vitest";
import { nextRunAfter, scheduleAction } from "./next-run";

const at = (iso: string) => new Date(iso);
const MONDAYS_AT_8 = "0 8 * * 1";

describe("nextRunAfter", () => {
  it("finds Monday 08:00 UTC from a Sunday afternoon", () => {
    expect(nextRunAfter(MONDAYS_AT_8, at("2026-09-20T15:00:00Z"))?.toISOString()).toBe("2026-09-21T08:00:00.000Z");
  });

  it("gives the next slot, not the same one, when `after` is exactly on a slot", () => {
    expect(nextRunAfter(MONDAYS_AT_8, at("2026-09-21T08:00:00Z"))?.toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("reads the expression in UTC whatever the server's own time zone is", () => {
    expect(nextRunAfter("30 23 * * *", at("2026-09-23T10:00:00Z"))?.toISOString()).toBe("2026-09-23T23:30:00.000Z");
  });

  it("steps every fifteen minutes", () => {
    expect(nextRunAfter("*/15 * * * *", at("2026-09-23T10:07:00Z"))?.toISOString()).toBe("2026-09-23T10:15:00.000Z");
  });

  it("answers null for an expression that is not cron, instead of throwing inside the tick", () => {
    expect(nextRunAfter("every monday", at("2026-09-23T10:00:00Z"))).toBeNull();
    expect(nextRunAfter("", at("2026-09-23T10:00:00Z"))).toBeNull();
  });
});

describe("scheduleAction", () => {
  const now = at("2026-09-23T10:07:00Z");

  it("does not fire a schedule seen for the first time; it only computes its next run", () => {
    expect(scheduleAction({ schedule: "*/15 * * * *", nextRunAt: null }, now)).toEqual({ fire: false, next: at("2026-09-23T10:15:00Z") });
  });

  it("fires a schedule whose next run is due, and moves it to the next slot after now", () => {
    expect(scheduleAction({ schedule: "*/15 * * * *", nextRunAt: at("2026-09-23T10:00:00Z") }, now)).toEqual({
      fire: true,
      next: at("2026-09-23T10:15:00Z"),
    });
  });

  it("fires a schedule due exactly now", () => {
    expect(scheduleAction({ schedule: "*/15 * * * *", nextRunAt: now }, now).fire).toBe(true);
  });

  // Engine review #5, the owner's call: a slot fired whenever the tick came back, so a digest meant for 08:00 arrived
  // in the afternoon. A slot more than an hour late is skipped, named, and the schedule moves on.
  it("skips a slot missed days ago (the worker was down): no run, the next slot after now, and the missed one named", () => {
    const a = scheduleAction({ schedule: "*/15 * * * *", nextRunAt: at("2026-09-20T10:00:00Z") }, now);
    expect(a).toEqual({ fire: false, next: at("2026-09-23T10:15:00Z"), missed: at("2026-09-20T10:00:00Z") });
  });

  it("still fires a slot up to an hour late", () => {
    const a = scheduleAction({ schedule: "0 * * * *", nextRunAt: at("2026-09-23T09:07:00Z") }, now); // exactly an hour
    expect(a).toEqual({ fire: true, next: at("2026-09-23T11:00:00Z") });
  });

  it("does not fire a weekday 08:00 schedule left due since Monday when the tick sees it on Friday at 15:00", () => {
    const a = scheduleAction({ schedule: "0 8 * * 1-5", nextRunAt: at("2026-09-21T08:00:00Z"), tz: "UTC" }, at("2026-09-25T15:00:00Z"));
    expect(a.fire).toBe(false);
    expect(a.next).toEqual(at("2026-09-28T08:00:00Z"));
  });

  it("leaves a schedule that is not due yet alone", () => {
    expect(scheduleAction({ schedule: "*/15 * * * *", nextRunAt: at("2026-09-23T10:15:00Z") }, now)).toEqual({
      fire: false,
      next: at("2026-09-23T10:15:00Z"),
    });
  });

  it("never fires an invalid schedule, and says it has no next run", () => {
    expect(scheduleAction({ schedule: "nonsense", nextRunAt: at("2026-09-23T10:00:00Z") }, now)).toEqual({ fire: false, next: null });
  });
});

// A schedule's cron is kept in the local time of the zone it was set in (automations.schedule_tz), so a weekday
// 08:00 stays 08:00 for the person across daylight saving. Europe/Prague leaves summer time on 2026-10-25.
describe("schedules in their own time zone", () => {
  const WEEKDAYS_AT_8 = "0 8 * * 1-5";

  it("reads 08:00 in Prague as 06:00 UTC in summer time", () => {
    expect(nextRunAfter(WEEKDAYS_AT_8, at("2026-10-22T07:00:00Z"), "Europe/Prague")?.toISOString()).toBe("2026-10-23T06:00:00.000Z");
  });

  it("keeps 08:00 local across the end of summer time: Friday 06:00 UTC, then Monday 07:00 UTC", () => {
    const friday = nextRunAfter(WEEKDAYS_AT_8, at("2026-10-22T07:00:00Z"), "Europe/Prague")!;
    const monday = nextRunAfter(WEEKDAYS_AT_8, friday, "Europe/Prague");
    expect(monday?.toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });

  it("reads a schedule saved before zones existed (no zone) in UTC, as before", () => {
    expect(nextRunAfter(WEEKDAYS_AT_8, at("2026-10-22T07:00:00Z"), null)?.toISOString()).toBe("2026-10-22T08:00:00.000Z");
  });

  it("answers null for a zone that does not exist, instead of firing at a guessed hour", () => {
    expect(nextRunAfter(WEEKDAYS_AT_8, at("2026-10-22T07:00:00Z"), "Mars/Olympus")).toBeNull();
  });

  it("moves a due Prague schedule to the next local 08:00 across the change", () => {
    const due = { schedule: WEEKDAYS_AT_8, nextRunAt: at("2026-10-23T06:00:00Z"), tz: "Europe/Prague" };
    expect(scheduleAction(due, at("2026-10-23T06:00:30Z"))).toEqual({ fire: true, next: at("2026-10-26T07:00:00Z") });
  });
});
