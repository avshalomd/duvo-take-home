import { describe, expect, it } from "vitest";
import { DRAFTS_PER_WINDOW, draftRefusal, recheckRefusal, spentRefusal } from "./spend-rule";

const now = new Date("2026-09-24T10:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("recheckRefusal: one Check again per run a minute", () => {
  it("lets the first re-check of a run through", () => {
    expect(recheckRefusal(null, now)).toBeNull();
  });

  it("refuses a second one within the minute, saying when to try again in whole seconds", () => {
    expect(recheckRefusal(ago(20_000), now)).toBe("This result was checked a moment ago. Try again in 40 seconds.");
    expect(recheckRefusal(ago(59_500), now)).toBe("This result was checked a moment ago. Try again in 1 second.");
  });

  it("lets one through once the minute is over", () => {
    expect(recheckRefusal(ago(60_000), now)).toBeNull();
  });
});

describe("draftRefusal: a few automation drafts per workspace every 10 minutes", () => {
  it("is three drafts", () => {
    expect(DRAFTS_PER_WINDOW).toBe(3);
  });

  it("lets drafts through below the limit", () => {
    expect(draftRefusal([], now)).toBeNull();
    expect(draftRefusal([ago(60_000), ago(120_000)], now)).toBeNull();
  });

  it("refuses the next one at the limit, saying when the oldest leaves the window, in whole minutes rounded up", () => {
    expect(draftRefusal([ago(9 * 60_000), ago(5 * 60_000), ago(60_000)], now)).toBe(
      "This workspace has drafted 3 automations in the last 10 minutes. Try again in about a minute.",
    );
    expect(draftRefusal([ago(60_000), ago(5 * 60_000), ago(6.5 * 60_000)], now)).toBe(
      "This workspace has drafted 3 automations in the last 10 minutes. Try again in about 4 minutes.",
    );
  });

  it("does not count drafts older than 10 minutes", () => {
    expect(draftRefusal([ago(11 * 60_000), ago(12 * 60_000), ago(60_000)], now)).toBeNull();
  });
});

describe("spentRefusal: no paid check or draft once the day's money is spent", () => {
  const day = { resetsAt: "2026-09-25T00:00:00.000Z" };
  it("lets it through while the workspace and the deployment have money left", () => {
    expect(spentRefusal({ ...day, workspaceSpentUsd: 1, workspaceBudgetUsd: 5, deploymentSpentUsd: 10, deploymentBudgetUsd: 50 })).toBeNull();
  });

  it("refuses once the workspace's budget for today is spent, with when it resets", () => {
    expect(spentRefusal({ ...day, workspaceSpentUsd: 5, workspaceBudgetUsd: 5, deploymentSpentUsd: 10, deploymentBudgetUsd: 50 })).toBe(
      "This workspace has spent its $5.00 budget for today. Try again after 00:00 UTC.",
    );
  });

  it("refuses once the whole deployment's spend for today is reached", () => {
    expect(spentRefusal({ ...day, workspaceSpentUsd: 1, workspaceBudgetUsd: 5, deploymentSpentUsd: 50, deploymentBudgetUsd: 50 })).toBe(
      "Handover has reached today's spending limit. Try again tomorrow.",
    );
  });
});
