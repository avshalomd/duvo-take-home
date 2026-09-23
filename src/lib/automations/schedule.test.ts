import { describe, expect, it } from "vitest";
import { AutomationError } from "./errors";
import { nextRunAt } from "./schedule";

const friday = new Date("2026-09-25T09:00:00.000Z"); // a Friday, after 08:00

describe("nextRunAt in the schedule's zone (schedule_tz)", () => {
  it("reads 08:00 as 08:00 in Prague: 06:00 UTC in summer", () => {
    expect(nextRunAt("0 8 * * 1-5", friday, "Europe/Prague").toISOString()).toBe("2026-09-28T06:00:00.000Z");
  });

  it("keeps it at 08:00 in Prague after the clocks change: 07:00 UTC in winter", () => {
    expect(nextRunAt("0 8 * * 1-5", new Date("2026-11-06T12:00:00.000Z"), "Europe/Prague").toISOString()).toBe("2026-11-09T07:00:00.000Z");
  });

  it("reads a schedule without a zone as UTC, which is how the first schedules were stored", () => {
    expect(nextRunAt("0 8 * * 1-5", friday, null).toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("refuses a zone that does not exist, with a readable reason", () => {
    expect(() => nextRunAt("0 8 * * 1-5", friday, "Mars/Olympus")).toThrow(AutomationError);
    expect(() => nextRunAt("0 8 * * 1-5", friday, "Mars/Olympus")).toThrow(/time zone/i);
  });
});

describe("nextRunAt", () => {
  it("moves 'every weekday at 08:00' from a Friday morning to Monday 08:00 UTC", () => {
    expect(nextRunAt("0 8 * * 1-5", friday).toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("gives today at 08:00 when it is still before 08:00", () => {
    expect(nextRunAt("0 8 * * 1-5", new Date("2026-09-23T07:00:00.000Z")).toISOString()).toBe("2026-09-23T08:00:00.000Z");
  });

  it("moves 'every Monday at 08:00' to the next Monday", () => {
    expect(nextRunAt("0 8 * * 1", friday).toISOString()).toBe("2026-09-28T08:00:00.000Z");
  });

  it("refuses a cron expression that does not parse, with a readable reason", () => {
    const err = (() => {
      try {
        nextRunAt("every day please", friday);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AutomationError);
    expect((err as Error).message).toMatch(/schedule/i);
  });

  it("refuses a schedule more often than once an hour, since every run costs money", () => {
    expect(() => nextRunAt("*/5 * * * *", friday)).toThrow(/once an hour/i);
  });
});
