import { describe, expect, it } from "vitest";
import { guardNotices } from "./guard-notice";

const g = (guard: string, decision: string, target?: string) => ({ guard, decision, reason: "raw reason for Details", target });

describe("guardNotices - what the guards did, in words for the person who asked", () => {
  it("says a web page that tried to send data elsewhere was stopped", () => {
    expect(guardNotices([g("url", "blocked", "evil.example")])).toEqual([
      { text: "A web page tried to make the agent send your data elsewhere. It was stopped.", tone: "warn", count: 1 },
    ]);
  });

  it("says a suspicious address that was let through was marked", () => {
    expect(guardNotices([g("url", "flagged")])[0].text).toBe(
      "The agent opened a web address that might pass your data on. It was let through and marked.",
    );
  });

  it("says a key or password kept out of a file was stopped", () => {
    expect(guardNotices([g("write", "blocked")])[0].text).toBe("The agent tried to save a password or key in a file. It was stopped.");
  });

  it("says a reach outside the run's folder was stopped", () => {
    expect(guardNotices([g("path", "blocked")])[0].text).toBe("The agent tried to reach files outside its own folder. It was stopped.");
  });

  it("names the connection that was used outside the plan", () => {
    expect(guardNotices([g("connection", "flagged", "GitHub")])[0].text).toBe("The agent used GitHub, which was not in its plan.");
    expect(guardNotices([g("connection", "blocked", "GitHub")])[0].text).toBe(
      "The agent tried to use GitHub, which was not in its plan. It was stopped.",
    );
  });

  it("says plainly when a safety check could not run", () => {
    expect(guardNotices([g("url", "unchecked")])).toEqual([
      { text: "A safety check could not run, so one step went ahead unchecked.", tone: "idle", count: 1 },
    ]);
  });

  it("counts a notice that repeats instead of listing it again", () => {
    const notices = guardNotices([g("url", "blocked"), g("write", "blocked"), g("url", "blocked")]);
    expect(notices.map((n) => n.count)).toEqual([2, 1]);
  });

  it("never shows the raw reason, which stays in Details", () => {
    for (const n of guardNotices([g("url", "blocked"), g("connection", "flagged", "x")])) expect(n.text).not.toContain("raw reason");
  });
});
