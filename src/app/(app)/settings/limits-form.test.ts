// The Limits form as the browser posts it, turned into WorkspaceLimits or into sentences a person can act on.
import { describe, expect, it } from "vitest";
import { parseLimitsForm } from "./limits-form";

function form(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.set(k, v);
  return f;
}
const valid = {
  dailyBudgetUsd: "5",
  dailyRunLimit: "30",
  maxInFlight: "3",
  stepChecks: "on",
  strictConnections: undefined, // an unchecked switch posts nothing, like a native checkbox
  deniedDomains: "",
};

describe("parseLimitsForm", () => {
  it("reads a complete form into WorkspaceLimits", () => {
    const out = parseLimitsForm(form(valid));
    expect(out).toEqual({
      ok: true,
      limits: { dailyBudgetUsd: 5, dailyRunLimit: 30, maxInFlight: 3, stepChecks: true, strictConnections: false, deniedDomains: [], autoHealAttempts: 2 },
    });
  });

  it("reads a budget with cents", () => {
    const out = parseLimitsForm(form({ ...valid, dailyBudgetUsd: "2.50" }));
    expect(out.ok && out.limits.dailyBudgetUsd).toBe(2.5);
  });

  it("reads a switch as on only when it posted 'on'", () => {
    const out = parseLimitsForm(form({ ...valid, stepChecks: undefined, strictConnections: "on" }));
    expect(out.ok && out.limits.stepChecks).toBe(false);
    expect(out.ok && out.limits.strictConnections).toBe(true);
  });

  it("refuses an empty budget instead of reading it as zero, which would stop every run", () => {
    const out = parseLimitsForm(form({ ...valid, dailyBudgetUsd: "" }));
    expect(out.ok).toBe(false);
    expect(!out.ok && out.fieldErrors.dailyBudgetUsd?.[0]).toMatch(/amount in dollars/);
  });

  it("refuses a negative budget or one over 1000 dollars", () => {
    expect(parseLimitsForm(form({ ...valid, dailyBudgetUsd: "-1" })).ok).toBe(false);
    expect(parseLimitsForm(form({ ...valid, dailyBudgetUsd: "1001" })).ok).toBe(false);
  });

  it("refuses a fraction of a run, and zero runs a day", () => {
    const half = parseLimitsForm(form({ ...valid, dailyRunLimit: "2.5" }));
    expect(!half.ok && half.fieldErrors.dailyRunLimit?.[0]).toMatch(/whole number of runs/);
    expect(parseLimitsForm(form({ ...valid, dailyRunLimit: "0" })).ok).toBe(false);
  });

  it("keeps runs at the same time between 1 and 10", () => {
    const out = parseLimitsForm(form({ ...valid, maxInFlight: "11" }));
    expect(!out.ok && out.fieldErrors.maxInFlight?.[0]).toMatch(/between 1 and 10/);
  });

  it("reads how many times the agent may fix its own result, 0 meaning off", () => {
    const three = parseLimitsForm(form({ ...valid, autoHealAttempts: "3" }));
    const off = parseLimitsForm(form({ ...valid, autoHealAttempts: "0" }));
    expect(three.ok && three.limits.autoHealAttempts).toBe(3);
    expect(off.ok && off.limits.autoHealAttempts).toBe(0);
  });

  it("keeps the default of 2 tries when the form has no such row", () => {
    const out = parseLimitsForm(form({ ...valid, autoHealAttempts: undefined }));
    expect(out.ok && out.limits.autoHealAttempts).toBe(2);
  });

  it("refuses more than 5 tries, or a fraction of one, in a sentence", () => {
    const six = parseLimitsForm(form({ ...valid, autoHealAttempts: "6" }));
    const half = parseLimitsForm(form({ ...valid, autoHealAttempts: "1.5" }));
    expect(!six.ok && six.fieldErrors.autoHealAttempts?.[0]).toBe("Give a whole number of tries between 0 and 5.");
    expect(half.ok).toBe(false);
  });

  it("reads blocked websites one per line, lower-cased, without blank lines or repeats", () => {
    const out = parseLimitsForm(form({ ...valid, deniedDomains: "Example.com\n\n  pastebin.com  \nexample.com\r\n" }));
    expect(out.ok && out.limits.deniedDomains).toEqual(["example.com", "pastebin.com"]);
  });

  it("keeps only the website of a pasted address: no scheme, path or port", () => {
    const out = parseLimitsForm(form({ ...valid, deniedDomains: "https://www.Example.com/some/page?q=1\nhttp://evil.io:8080" }));
    expect(out.ok && out.limits.deniedDomains).toEqual(["www.example.com", "evil.io"]);
  });

  it("names the line that is not a website", () => {
    const out = parseLimitsForm(form({ ...valid, deniedDomains: "example.com\nnot a website" }));
    expect(out.ok).toBe(false);
    expect(!out.ok && out.fieldErrors.deniedDomains?.[0]).toMatch(/"not a website" is not a website/);
  });

  it("gives every refused form back as it was typed, so nothing has to be typed again", () => {
    const out = parseLimitsForm(form({ ...valid, dailyRunLimit: "abc", deniedDomains: "example.com" }));
    expect(!out.ok && out.values).toEqual({
      dailyBudgetUsd: "5",
      dailyRunLimit: "abc",
      maxInFlight: "3",
      stepChecks: "on",
      strictConnections: "",
      deniedDomains: "example.com",
      autoHealAttempts: "",
    });
  });
});
