import { describe, expect, it } from "vitest";
import { describeChoice, fromUtcCron, toUtcCron } from "./schedule-local";

// offset = Date#getTimezoneOffset(): the minutes to add to local time to get UTC (Prague in summer is -120).
const PRAGUE_SUMMER = -120;
const TOKYO = -540;
const NEW_YORK_SUMMER = 240;

describe("toUtcCron (Q107: schedules are chosen in the viewer's time, stored in UTC)", () => {
  it("keeps the time when the viewer is on UTC", () => {
    expect(toUtcCron({ repeat: "weekdays", time: "08:00" }, 0)).toBe("0 8 * * 1-5");
  });

  it("moves 08:00 in Prague to 06:00 UTC", () => {
    expect(toUtcCron({ repeat: "weekdays", time: "08:00" }, PRAGUE_SUMMER)).toBe("0 6 * * 1-5");
    expect(toUtcCron({ repeat: "mondays", time: "08:30" }, PRAGUE_SUMMER)).toBe("30 6 * * 1");
  });

  it("moves the days back when 08:00 local is still the day before in UTC", () => {
    expect(toUtcCron({ repeat: "weekdays", time: "08:00" }, TOKYO)).toBe("0 23 * * 0-4");
    expect(toUtcCron({ repeat: "mondays", time: "08:00" }, TOKYO)).toBe("0 23 * * 0");
  });

  it("moves the days on when the local evening is already the next day in UTC", () => {
    expect(toUtcCron({ repeat: "mondays", time: "22:00" }, NEW_YORK_SUMMER)).toBe("0 2 * * 2");
    expect(toUtcCron({ repeat: "weekdays", time: "22:00" }, NEW_YORK_SUMMER)).toBe("0 2 * * 2-6");
  });

  it("writes every day as any day, whatever the shift", () => {
    expect(toUtcCron({ repeat: "daily", time: "07:15" }, TOKYO)).toBe("15 22 * * *");
  });
});

describe("fromUtcCron", () => {
  it("reads a stored cron back as the choice in the viewer's time", () => {
    expect(fromUtcCron("0 6 * * 1-5", PRAGUE_SUMMER)).toEqual({ repeat: "weekdays", time: "08:00" });
    expect(fromUtcCron("0 23 * * 0", TOKYO)).toEqual({ repeat: "mondays", time: "08:00" });
    expect(fromUtcCron("0 2 * * 2-6", NEW_YORK_SUMMER)).toEqual({ repeat: "weekdays", time: "22:00" });
  });

  it("round-trips every choice the form can make", () => {
    for (const offset of [0, PRAGUE_SUMMER, TOKYO, NEW_YORK_SUMMER, 330])
      for (const repeat of ["weekdays", "mondays", "daily"] as const)
        for (const time of ["00:30", "08:00", "23:45"]) expect(fromUtcCron(toUtcCron({ repeat, time }, offset), offset)).toEqual({ repeat, time });
  });

  it("answers null for a cron the form did not write, which is shown as custom", () => {
    expect(fromUtcCron("30 6 1 * *", 0)).toBeNull();
    expect(fromUtcCron("*/30 * * * *", 0)).toBeNull();
    expect(fromUtcCron("not a cron", 0)).toBeNull();
  });
});

describe("describeChoice", () => {
  it("says the schedule in words, in the viewer's time", () => {
    expect(describeChoice({ repeat: "weekdays", time: "08:00" })).toBe("Every weekday at 08:00");
    expect(describeChoice({ repeat: "mondays", time: "09:30" })).toBe("Every Monday at 09:30");
    expect(describeChoice({ repeat: "daily", time: "07:00" })).toBe("Every day at 07:00");
  });
});
