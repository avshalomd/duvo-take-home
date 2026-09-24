// Today's usage in words and meters, as the Limits page shows it.
import { describe, expect, it } from "vitest";
import { meterFill, resetsIn, startsOverAt, usd } from "./usage-format";

// UX QA U28: the day starts over at the same instant everywhere (UTC midnight); it is said on the reader's clock
describe("startsOverAt", () => {
  const midnight = "2026-09-24T00:00:00.000Z";

  it("says the reader's own time, on the 24-hour clock the schedules use", () => {
    expect(startsOverAt(midnight, "Europe/Oslo")).toBe("at 02:00 your time"); // summer time, UTC+2
    expect(startsOverAt(midnight, "Asia/Kolkata")).toBe("at 05:30 your time");
    expect(startsOverAt(midnight, "America/New_York")).toBe("at 20:00 your time");
  });

  it("says midnight UTC before the reader's zone is known (the server's render)", () => {
    expect(startsOverAt(midnight, null)).toBe("at midnight UTC");
  });
});

describe("usd", () => {
  it("writes dollars with cents", () => {
    expect(usd(0.4)).toBe("$0.40");
    expect(usd(5)).toBe("$5.00");
  });

  it("shows a spend under a cent as less than a cent, not as $0.00, so it does not read as nothing", () => {
    expect(usd(0.003)).toBe("under $0.01");
    expect(usd(0)).toBe("$0.00");
  });
});

describe("resetsIn", () => {
  const now = new Date("2026-09-23T18:48:00.000Z");
  it("counts hours and minutes to the reset", () => {
    expect(resetsIn("2026-09-24T00:00:00.000Z", now)).toBe("in 5 hours 12 minutes");
  });

  it("drops the minutes on the hour, and says one hour in the singular", () => {
    expect(resetsIn("2026-09-24T00:00:00.000Z", new Date("2026-09-23T23:00:00.000Z"))).toBe("in 1 hour");
  });

  it("counts minutes in the last hour", () => {
    expect(resetsIn("2026-09-24T00:00:00.000Z", new Date("2026-09-23T23:59:00.000Z"))).toBe("in 1 minute");
    expect(resetsIn("2026-09-24T00:00:00.000Z", new Date("2026-09-23T23:20:00.000Z"))).toBe("in 40 minutes");
  });

  it("says 'in under a minute' at the very end of the day", () => {
    expect(resetsIn("2026-09-24T00:00:00.000Z", new Date("2026-09-23T23:59:40.000Z"))).toBe("in under a minute");
  });
});

describe("meterFill", () => {
  it("gives the share used as a percentage, and calm below 80%", () => {
    expect(meterFill(4, 30)).toEqual({ percent: 13, tone: "ok" });
  });

  it("warns from 80%", () => {
    expect(meterFill(24, 30)).toEqual({ percent: 80, tone: "warn" });
  });

  it("is full at the limit and never draws past 100%", () => {
    expect(meterFill(30, 30)).toEqual({ percent: 100, tone: "full" });
    expect(meterFill(7, 5)).toEqual({ percent: 100, tone: "full" });
  });

  it("is full when the limit is zero", () => {
    expect(meterFill(0, 0)).toEqual({ percent: 100, tone: "full" });
  });
});
