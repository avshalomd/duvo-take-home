import { afterEach, describe, expect, it, vi } from "vitest";
import { runnerToken, verifyRunnerToken } from "./token";

const RUN = "5b6f0c2e-8a4d-4d8e-9d3b-2f1e0a9c7b11";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the runner's token", () => {
  it("is accepted for the run it was made for", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    expect(verifyRunnerToken(RUN, runnerToken(RUN))).toBe(true);
  });

  it("is refused for another run: a token starts one run only", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    expect(verifyRunnerToken("0f0f0f0f-0000-4000-8000-000000000000", runnerToken(RUN))).toBe(false);
  });

  it("is refused when made with another deployment's secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    const foreign = runnerToken(RUN);
    vi.stubEnv("BETTER_AUTH_SECRET", "b".repeat(32));
    expect(verifyRunnerToken(RUN, foreign)).toBe(false);
  });

  it("refuses a missing or malformed token without throwing", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(32));
    for (const bad of [null, "", "abc", runnerToken(RUN).slice(1)]) expect(verifyRunnerToken(RUN, bad)).toBe(false);
  });

  it("cannot be made without a secret: no deployment accepts an empty key", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(() => runnerToken(RUN)).toThrow(/BETTER_AUTH_SECRET/);
    expect(verifyRunnerToken(RUN, "anything")).toBe(false);
  });
});
