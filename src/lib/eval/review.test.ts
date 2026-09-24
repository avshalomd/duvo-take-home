import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluateInput } from "@/contracts/eval";

// extract() is replaced: what this pins is the time the reviewer's model call is given, not the model's answer.
vi.mock("@/lib/llm/extract", () => ({ extract: vi.fn() }));
const { extract } = await import("@/lib/llm/extract");
const { reviewRun } = await import("./review");
const extractMock = vi.mocked(extract);

const input: EvaluateInput = { prompt: "Write a note.", runStatus: "succeeded", report: "Wrote note.md.", plan: null, files: [], today: "2026-09-24" };
type Sent = { timeoutMs: number; signal?: AbortSignal };
const sent = () => extractMock.mock.calls[0][0] as unknown as Sent;

beforeEach(() => {
  extractMock.mockReset();
  extractMock.mockResolvedValue({ data: { taskFinished: true, responseSuitable: true, changeNeeded: null, reasoning: "ok" }, modelId: "m" } as never);
});

// Engine review #1: the reviewer had 45 s per try, plus the prompt-mode retry and the fallback model, inside a 50 s box.
describe("the reviewer's time", () => {
  it("gives the model call only the time left before the deadline, retries and fallback included", async () => {
    await reviewRun(input, [], { endsAt: Date.now() + 12_000 });
    expect(sent().timeoutMs).toBeLessThanOrEqual(12_000);
    expect(sent().timeoutMs).toBeGreaterThan(11_000);
    expect(sent().signal).toBeInstanceOf(AbortSignal); // one clock over every try, so a retry cannot add its own 45 s
  });

  it("keeps its own 45 s when no deadline is set", async () => {
    await reviewRun(input, []);
    expect(sent().timeoutMs).toBe(45_000);
    expect(sent().signal).toBeUndefined();
  });
});
