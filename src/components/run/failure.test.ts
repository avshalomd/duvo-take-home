import { describe, expect, it } from "vitest";
import { AUTOMATION_GONE } from "@/lib/agent/automation-check";
import { failureCause } from "./failure";

// The failed run's banner sent the reader to Details, where there was only a red monospace "Raw error". The banner
// now says the cause in one plain sentence when it is one we know; the raw error stays in Details.
describe("failureCause - why a run broke, in one plain sentence", () => {
  it("names the run's own limits", () => {
    expect(failureCause("timed out after 290 s")).toBe("It ran out of time before it finished.");
    expect(failureCause("error_max_turns")).toBe("It used up the number of steps one run may take.");
    expect(failureCause("error_max_budget_usd")).toBe("It reached the spending limit for one run.");
  });

  it("names a problem at the AI service without its codes", () => {
    expect(failureCause("API Error: 529 {\"type\":\"overloaded_error\"}")).toBe("The AI service was too busy to answer.");
    expect(failureCause("429 rate_limit_error: too many requests")).toBe("The AI service had too many requests at once.");
    expect(failureCause("401 authentication_error: invalid x-api-key")).toBe("The AI service did not accept the app's key.");
    expect(failureCause("Your credit balance is too low to access the API")).toBe("The AI account has run out of credit.");
  });

  it("passes on the app's own sentences as they are", () => {
    expect(failureCause(AUTOMATION_GONE)).toBe("The automation this run belongs to was deleted.");
    expect(failureCause("The agent was offered a tool source this workspace did not add (x), so the run was stopped before it could use it.")).toBe(
      "The agent was offered a tool source this workspace did not add (x), so the run was stopped before it could use it.",
    );
  });

  it("says nothing it does not know: an unknown error stays in Details", () => {
    expect(failureCause("error_during_execution: the page returned 404")).toBeNull();
    expect(failureCause("TypeError: undefined is not a function")).toBeNull();
    expect(failureCause(null)).toBeNull();
    expect(failureCause("")).toBeNull();
  });
});
