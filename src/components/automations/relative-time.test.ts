import { describe, expect, it } from "vitest";
import { relativeTime } from "./relative-time";

const now = new Date("2026-09-22T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("calls anything under a minute 'just now', so a run that just started reads as live", () => {
    expect(relativeTime(ago(5_000), now)).toBe("just now");
    expect(relativeTime(ago(59_000), now)).toBe("just now");
  });

  it("counts whole minutes, then hours, then days", () => {
    expect(relativeTime(ago(2 * 60_000), now)).toBe("2 min ago");
    expect(relativeTime(ago(59 * 60_000), now)).toBe("59 min ago");
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe("3 h ago");
    expect(relativeTime(ago(2 * 86_400_000), now)).toBe("2 d ago");
  });

  it("never reads as the future when the server clock is ahead of the browser", () => {
    expect(relativeTime(new Date(now.getTime() + 30_000).toISOString(), now)).toBe("just now");
  });

  it("returns an empty string for a date it cannot read, instead of 'NaN min ago'", () => {
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});
