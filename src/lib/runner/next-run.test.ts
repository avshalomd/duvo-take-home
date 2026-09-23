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

  it("fires once for slots missed days ago (the worker was down), not once per missed slot", () => {
    const a = scheduleAction({ schedule: "*/15 * * * *", nextRunAt: at("2026-09-20T10:00:00Z") }, now);
    expect(a).toEqual({ fire: true, next: at("2026-09-23T10:15:00Z") });
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
