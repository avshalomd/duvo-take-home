import { describe, expect, it } from "vitest";
import { groupByDay } from "./rail";
import { fullDate, relativeTime } from "./relative-time";

const now = new Date("2026-09-23T12:00:00.000Z"); // a Wednesday, noon UTC
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("calls anything under a minute 'Just now', so a run that just started reads as live", () => {
    expect(relativeTime(ago(5_000), now, "UTC")).toBe("Just now");
    expect(relativeTime(ago(59_000), now, "UTC")).toBe("Just now");
  });

  it("counts minutes, then hours, in words, while it is still the same day", () => {
    expect(relativeTime(ago(2 * 60_000), now, "UTC")).toBe("2 min ago");
    expect(relativeTime(ago(59 * 60_000), now, "UTC")).toBe("59 min ago");
    expect(relativeTime(ago(HOUR), now, "UTC")).toBe("1 hour ago");
    expect(relativeTime(ago(3 * HOUR), now, "UTC")).toBe("3 hours ago");
  });

  // UX QA U19: the header said "1 d ago" and "2 d ago" while the rail put the same runs under "Yesterday" and "Tuesday"
  it("says Yesterday and then whole days by the reader's calendar, as the rail groups them", () => {
    expect(relativeTime(ago(DAY), now, "UTC")).toBe("Yesterday");
    expect(relativeTime(ago(2 * DAY), now, "UTC")).toBe("2 days ago");
    expect(relativeTime(ago(6 * DAY), now, "UTC")).toBe("6 days ago");
  });

  it("calls a run from late last evening Yesterday, not '13 hours ago', since the rail files it there", () => {
    const lateLastNight = "2026-09-22T23:30:00.000Z";
    expect(relativeTime(lateLastNight, now, "UTC")).toBe("Yesterday");
    expect(groupByDay([{ createdAt: lateLastNight }], now, "UTC")[0].label).toBe("Yesterday");
  });

  it("agrees with the rail's day in the reader's time zone", () => {
    const late = "2026-09-22T22:30:00.000Z"; // already the 23rd in Berlin
    expect(relativeTime(late, now, "Europe/Berlin")).toBe("13 hours ago");
    expect(groupByDay([{ createdAt: late }], now, "Europe/Berlin")[0].label).toBe("Today");
  });

  it("gives the date after a week, as the rail does", () => {
    expect(relativeTime("2026-09-16T12:00:00.000Z", now, "UTC")).toBe("16 Sep");
    expect(relativeTime("2025-12-31T12:00:00.000Z", now, "UTC")).toBe("31 Dec 2025");
  });

  it("never reads as the future when the server clock is ahead of the browser", () => {
    expect(relativeTime(new Date(now.getTime() + 30_000).toISOString(), now, "UTC")).toBe("Just now");
  });

  it("returns an empty string for a date it cannot read, instead of 'NaN min ago'", () => {
    expect(relativeTime("not-a-date", now, "UTC")).toBe("");
  });
});

// UX QA U8: hovering the header's time showed the stored value, 2026-09-23T12:14:36.323Z
describe("fullDate", () => {
  it("reads as a day and a time in the reader's zone, never as the stored ISO string", () => {
    expect(fullDate("2026-09-23T12:14:36.323Z", "Europe/Oslo", now)).toBe("Wednesday 23 September, 14:14");
  });

  it("adds the year to a date from another year", () => {
    expect(fullDate("2025-12-31T09:05:00.000Z", "UTC", now)).toBe("Wednesday 31 December 2025, 09:05");
  });

  it("returns an empty string for a date it cannot read", () => {
    expect(fullDate("not-a-date", "UTC", now)).toBe("");
  });
});
