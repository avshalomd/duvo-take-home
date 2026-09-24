import { describe, expect, it } from "vitest";
import { tabTitle } from "./tab-title";

// UX QA U5: every page behind sign-in was titled "Handover", so tabs and history entries all looked the same
describe("tabTitle - a run's brief as the browser tab's title", () => {
  it("keeps a short brief whole", () => {
    expect(tabTitle("Make a bar chart of the five largest EU countries")).toBe("Make a bar chart of the five largest EU countries");
  });

  it("cuts a long brief at a word, well inside what a tab shows", () => {
    const long = "Read the three most recent quarterly reports of every listed European carmaker and compare their margins";
    const cut = tabTitle(long);
    expect(cut).toBe("Read the three most recent quarterly reports of every listed...");
    expect(cut.length).toBeLessThanOrEqual(63);
  });

  it("reads a brief of several lines as one", () => {
    expect(tabTitle("Write a haiku\n\n  about Monday")).toBe("Write a haiku about Monday");
  });
});
