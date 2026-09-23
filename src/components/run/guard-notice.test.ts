import { describe, expect, it } from "vitest";
import { guardNotices } from "./guard-notice";

const g = (guard: string, decision: string, target?: string, reason = "raw reason for Details") => ({ guard, decision, reason, target });
// the url guard's own reasons (src/lib/agent/guards/url.ts), one per cause
const LEAK = "This address looks like it carries the task's data to another site. Leave the data out of the address.";
const PRIVATE = "10.0.0.5 is a private or local address. Only public web pages can be fetched.";
const DENIED = "news.example is blocked in this workspace's settings. Use another source.";
const SCHEME = "Only web pages (http or https) can be fetched, not file: addresses.";

describe("guardNotices - what the guards did, in words for the person who asked", () => {
  it("says a web page that tried to send data elsewhere was stopped", () => {
    expect(guardNotices([g("url", "blocked", "evil.example", LEAK)])).toEqual([
      { text: "A web page tried to make the agent send your data elsewhere. It was stopped.", tone: "warn", count: 1 },
    ]);
  });

  // Q127: one sentence for every url block blamed a web page for what was a setting or a private address
  it("says what the url guard stopped by its cause: a private address, a site blocked in Settings, not a web page", () => {
    expect(guardNotices([g("url", "blocked", "10.0.0.5", PRIVATE)])[0].text).toBe(
      "The agent tried to open a private or local address. It was stopped.",
    );
    expect(guardNotices([g("url", "blocked", "news.example", DENIED)])[0].text).toBe(
      "The agent tried to open news.example, which is blocked in Settings. It was stopped.",
    );
    expect(guardNotices([g("url", "blocked", "file:///etc/passwd", SCHEME)])[0].text).toBe(
      "The agent tried to open an address that is not a web page. It was stopped.",
    );
  });

  it("says plainly that a web address was stopped when the reason is one it does not know", () => {
    expect(guardNotices([g("url", "blocked", "x.example")])[0].text).toBe("The agent was stopped from opening a web address.");
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
