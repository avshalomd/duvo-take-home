import { describe, expect, it } from "vitest";
import { groupByDay, matchesSearch, runTag, runTitle } from "./rail";

const at = (createdAt: string) => ({ id: createdAt, createdAt });
const NOW = new Date("2026-09-23T10:00:00Z"); // a Wednesday
const labels = (groups: { label: string; runs: unknown[] }[]) => groups.map((g) => [g.label, g.runs.length]);

describe("groupByDay - the rail reads like a diary, newest day first", () => {
  it("puts the runs of the reader's today under Today and of the day before under Yesterday", () => {
    const runs = [at("2026-09-23T09:00:00Z"), at("2026-09-23T00:30:00Z"), at("2026-09-22T18:00:00Z")];
    expect(labels(groupByDay(runs, NOW, "UTC"))).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
    ]);
  });

  it("names the weekday for the rest of the last week, and the date before that", () => {
    const runs = [at("2026-09-21T12:00:00Z"), at("2026-09-17T12:00:00Z"), at("2026-09-16T12:00:00Z")];
    expect(groupByDay(runs, NOW, "UTC").map((g) => g.label)).toEqual(["Monday", "Thursday", "16 Sep"]);
  });

  it("adds the year to a date from another year", () => {
    expect(groupByDay([at("2025-12-31T12:00:00Z")], NOW, "UTC").map((g) => g.label)).toEqual(["31 Dec 2025"]);
  });

  it("counts days in the reader's time zone: 22:30 UTC yesterday is already today in Berlin", () => {
    const late = [at("2026-09-22T22:30:00Z")];
    expect(groupByDay(late, NOW, "UTC")[0].label).toBe("Yesterday");
    expect(groupByDay(late, NOW, "Europe/Berlin")[0].label).toBe("Today");
  });

  it("keeps the runs in the order it was given, one group per day", () => {
    const runs = [at("2026-09-23T09:00:00Z"), at("2026-09-23T08:00:00Z"), at("2026-09-22T09:00:00Z")];
    const [today] = groupByDay(runs, NOW, "UTC");
    expect(today.runs.map((r) => r.createdAt)).toEqual(["2026-09-23T09:00:00Z", "2026-09-23T08:00:00Z"]);
  });

  it("files a run stamped a little in the future (a clock ahead of ours) under Today", () => {
    expect(groupByDay([at("2026-09-24T09:00:00Z")], NOW, "UTC")[0].label).toBe("Today");
  });

  it("has no groups when there are no runs", () => {
    expect(groupByDay([], NOW, "UTC")).toEqual([]);
  });
});

describe("matchesSearch - the rail's search box", () => {
  const run = { prompt: "Fetch the latest AI news from the web and save them into a CSV" };

  it("matches the instructions whatever the case", () => {
    expect(matchesSearch(run, "ai NEWS")).toBe(true);
  });

  it("needs every word, in any order", () => {
    expect(matchesSearch(run, "csv fetch")).toBe(true);
    expect(matchesSearch(run, "csv deepwiki")).toBe(false);
  });

  it("lets everything through when the box is empty", () => {
    expect(matchesSearch(run, "")).toBe(true);
    expect(matchesSearch(run, "   ")).toBe(true);
  });

  // Q133: an automation's run is found by what the person typed - its command, its name, its input
  it("also matches the title and the command a run was started with", () => {
    const audit = { prompt: "Audit Acme Ltd: ownership, filings ...", title: "Company audit: Acme Ltd", tag: "\\audit" };
    expect(matchesSearch(audit, "audit")).toBe(true);
    expect(matchesSearch(audit, "\\audit acme")).toBe(true);
    expect(matchesSearch(audit, "company")).toBe(true);
  });
});

const NAMES = { "auto-1": "Company audit" };

describe("runTitle - a short name for a run", () => {
  it("is the first line of the instructions", () => {
    expect(runTitle({ prompt: "\n  Fetch the news\nas CSV", purpose: "adhoc", input: null, automationId: null }, NAMES)).toBe("Fetch the news");
  });

  // Q94, Q95: the filled-in template is not a name a person gave it
  it("is the automation's name and the input for a run of a saved automation, a scheduled run and an example", () => {
    for (const purpose of ["automation", "schedule", "trial"] as const)
      expect(runTitle({ prompt: "Audit Acme Ltd: ownership, filings ...", purpose, input: "Acme Ltd", automationId: "auto-1" }, NAMES)).toBe(
        "Company audit: Acme Ltd",
      );
  });

  it("is the input alone when the automation is gone, and the name alone when there was no input", () => {
    expect(runTitle({ prompt: "Audit ...", purpose: "automation", input: "Acme Ltd", automationId: "deleted" }, NAMES)).toBe("Acme Ltd");
    expect(runTitle({ prompt: "Weekly AI digest", purpose: "schedule", input: "", automationId: "auto-1" }, NAMES)).toBe("Company audit");
  });

  it("falls back to the instructions when an automation run has neither", () => {
    expect(runTitle({ prompt: "Weekly AI digest", purpose: "schedule", input: "", automationId: null }, NAMES)).toBe("Weekly AI digest");
  });
});

describe("runTag - the quiet label that says why a run exists", () => {
  const commands = { "auto-1": "audit" };

  it("names the command of a saved automation", () => {
    expect(runTag({ purpose: "automation", automationId: "auto-1" }, commands)).toBe("\\audit");
  });

  it("says a scheduled run was started by the schedule", () => {
    expect(runTag({ purpose: "schedule", automationId: "auto-1" }, commands)).toBe("\\audit, scheduled");
  });

  it("still tags an automation run whose automation is gone", () => {
    expect(runTag({ purpose: "automation", automationId: "deleted" }, commands)).toBe("automation");
  });

  it("marks follow-ups and examples, and leaves a plain run untagged", () => {
    expect(runTag({ purpose: "followup", automationId: null }, commands)).toBe("follow-up");
    expect(runTag({ purpose: "trial", automationId: "auto-1" }, commands)).toBe("example");
    expect(runTag({ purpose: "adhoc", automationId: null }, commands)).toBeNull();
    expect(runTag({ automationId: null }, commands)).toBeNull(); // a v1 row has no purpose at all
  });
});
