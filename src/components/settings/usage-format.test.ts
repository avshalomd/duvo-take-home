// Today's usage in words and meters, as the Limits page shows it.
import { describe, expect, it } from "vitest";
import { meterFill, resetsIn, usd } from "./usage-format";

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
