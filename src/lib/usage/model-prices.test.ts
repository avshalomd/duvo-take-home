import { describe, expect, it } from "vitest";
import { costOfCall } from "./model-prices";

describe("costOfCall: what one model call cost, from its tokens", () => {
  it("prices Claude Sonnet 5 at its list price, $2 in and $10 out per million tokens", () => {
    expect(costOfCall({ modelId: "claude-sonnet-5", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(12, 6);
    expect(costOfCall({ modelId: "claude-sonnet-5", inputTokens: 20_000, outputTokens: 1_000 })).toBeCloseTo(0.05, 6);
  });

  it("knows the model by its name inside a gateway's longer id", () => {
    expect(costOfCall({ modelId: "anthropic/claude-sonnet-5", inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(2, 6);
  });

  it("counts a model it has no price for at the dearest price it knows, so the day is never under-counted", () => {
    expect(costOfCall({ modelId: "some/new-model", inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(18, 6);
  });

  it("prices the decision model by what it read: it writes no text", () => {
    expect(costOfCall({ modelId: "typesafe/jev-1.13-20260917", inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1, 6);
  });

  it("costs nothing when nothing was read or written", () => {
    expect(costOfCall({ modelId: "claude-sonnet-5", inputTokens: 0, outputTokens: 0 })).toBe(0);
  });
});
