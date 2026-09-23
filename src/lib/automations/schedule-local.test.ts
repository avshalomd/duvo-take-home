import { describe, expect, it } from "vitest";
import { choiceToCron, cronToChoice, describeChoice, zoneName } from "./schedule-local";

// The cron is kept in the schedule's own zone (schedule_tz), so "08:00" is written as 08:00: no conversion to UTC,
// and it stays 08:00 across a daylight-saving change.
describe("choiceToCron", () => {
  it("writes the local time and days as they were chosen", () => {
    expect(choiceToCron({ repeat: "weekdays", time: "08:00" })).toBe("0 8 * * 1-5");
    expect(choiceToCron({ repeat: "mondays", time: "08:30" })).toBe("30 8 * * 1");
    expect(choiceToCron({ repeat: "daily", time: "22:05" })).toBe("5 22 * * *");
  });
});

describe("cronToChoice", () => {
  it("reads a cron the form wrote back as the choice", () => {
    expect(cronToChoice("0 8 * * 1-5")).toEqual({ repeat: "weekdays", time: "08:00" });
    expect(cronToChoice("30 8 * * 1")).toEqual({ repeat: "mondays", time: "08:30" });
    expect(cronToChoice("5 22 * * *")).toEqual({ repeat: "daily", time: "22:05" });
  });

  it("round-trips every choice the form can make", () => {
    for (const repeat of ["weekdays", "mondays", "daily"] as const)
      for (const time of ["00:30", "08:00", "23:45"]) expect(cronToChoice(choiceToCron({ repeat, time }))).toEqual({ repeat, time });
  });

  it("answers null for a cron the form did not write, which is shown as custom", () => {
    expect(cronToChoice("30 6 1 * *")).toBeNull();
    expect(cronToChoice("0 8 * * 2-6")).toBeNull();
    expect(cronToChoice("*/30 * * * *")).toBeNull();
    expect(cronToChoice("not a cron")).toBeNull();
  });
});

describe("describeChoice", () => {
  it("says the schedule in words", () => {
    expect(describeChoice({ repeat: "weekdays", time: "08:00" })).toBe("Every weekday at 08:00");
    expect(describeChoice({ repeat: "mondays", time: "09:30" })).toBe("Every Monday at 09:30");
    expect(describeChoice({ repeat: "daily", time: "07:00" })).toBe("Every day at 07:00");
  });
});

describe("zoneName", () => {
  it("names a zone the way people read it", () => {
    expect(zoneName("Europe/Prague")).toBe("Prague time");
    expect(zoneName("America/New_York")).toBe("New York time");
    expect(zoneName("UTC")).toBe("UTC");
  });
});
