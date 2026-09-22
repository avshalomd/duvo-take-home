import { describe, expect, it, vi } from "vitest";
import type { EvaluateInput, Judgment, Review } from "@/contracts/eval";
import { LlmError } from "@/lib/llm/errors";
import { evaluate } from "./evaluate";

// The cascade, with both model steps injected: what this pins is WHICH verdict each combination of answers
// produces, and that the expensive step is only reached when the cheap ones cannot decide.
const input: EvaluateInput = {
  prompt: "Fetch the latest AI news and save them into a CSV with title, source, url, published_at, summary.",
  runStatus: "succeeded",
  report: "Wrote output.csv with 2 rows.",
  plan: null,
  files: [
    {
      name: "output.csv",
      content:
        "title,source,url,published_at,summary\n" +
        '"A ships X",Anthropic,https://a.example/1,2026-09-21,"Structured output"\n' +
        '"B raises money",Bloomberg,https://b.example/2,2026-09-18,"Series D"\n',
    },
  ],
  today: "2026-09-22",
};

const judgment = (answeredQuery: number, followedPlan: number): Judgment => ({ answeredQuery, followedPlan });
const review = (over: Partial<Review> = {}): Review => ({
  taskFinished: true,
  responseSuitable: true,
  changeNeeded: null,
  reasoning: "Eight of nine rows are AI news; the iPhone row is consumer tech.",
  ...over,
});
const deps = (j: Judgment | Error, r: Review | Error = review()) => ({
  judge: vi.fn(async () => {
    if (j instanceof Error) throw j;
    return j;
  }),
  review: vi.fn(async () => {
    if (r instanceof Error) throw r;
    return r;
  }),
});

describe("evaluate", () => {
  it("fails on a failed code check without spending a model call", async () => {
    const d = deps(judgment(0.99, 0.99));
    const verdict = await evaluate({ ...input, files: [{ name: "output.csv", content: "title,source\n" }] }, d);
    expect(verdict.verdict).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/no rows/i);
    expect(d.judge).not.toHaveBeenCalled();
    expect(verdict.judgment).toBeNull();
  });

  it("passes when the judge is confident on both questions", async () => {
    const d = deps(judgment(0.97, 0.95));
    const verdict = await evaluate(input, d);
    expect(verdict.verdict).toBe("pass");
    expect(verdict.judgment).toEqual(judgment(0.97, 0.95));
    expect(verdict.review).toBeNull();
    expect(d.review).not.toHaveBeenCalled();
  });

  it("fails when the judge is confident the work does not answer the instructions", async () => {
    const d = deps(judgment(0.02, 0.9));
    const verdict = await evaluate(input, d);
    expect(verdict.verdict).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/instructions/i);
    expect(d.review).not.toHaveBeenCalled(); // a confident no needs no second opinion
  });

  it("escalates to the review when the judge says the plan was not followed", async () => {
    const d = deps(judgment(0.96, 0.03));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.review).not.toBeNull();
  });

  it("escalates to the review when the judge is not confident either way", async () => {
    const d = deps(judgment(0.96, 0.6));
    await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
  });

  it("returns pass_with_notes when the review finds the task finished and the response usable", async () => {
    const verdict = await evaluate(input, deps(judgment(0.96, 0.5), review()));
    expect(verdict.verdict).toBe("pass_with_notes");
    expect(verdict.reasons.join(" ")).toMatch(/iPhone/);
  });

  it("fails with what would have to change when the response is not usable", async () => {
    const r = review({ responseSuitable: false, changeNeeded: "Drop the football rows and re-run the search." });
    const verdict = await evaluate(input, deps(judgment(0.96, 0.5), r));
    expect(verdict.verdict).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/Drop the football rows/);
  });

  it("fails when the review finds the task unfinished", async () => {
    const verdict = await evaluate(input, deps(judgment(0.96, 0.5), review({ taskFinished: false })));
    expect(verdict.verdict).toBe("fail");
  });

  it("returns unknown, with the checks kept, when the judge is unavailable", async () => {
    const d = deps(new LlmError("The decision model failed: HTTP 429", "unavailable"));
    const verdict = await evaluate(input, d);
    expect(verdict.verdict).toBe("unknown");
    expect(verdict.checks.length).toBeGreaterThan(0);
    expect(verdict.checks.every((c) => c.ok)).toBe(true);
    expect(verdict.reasons.join(" ")).toMatch(/429/); // the provider's own words, not "the model failed"
  });

  it("returns unknown when the review itself is unavailable", async () => {
    const d = deps(judgment(0.96, 0.5), new LlmError("The model took too long (30 s). Retry.", "timeout"));
    const verdict = await evaluate(input, d);
    expect(verdict.verdict).toBe("unknown");
    expect(verdict.reasons.join(" ")).toMatch(/too long/);
  });

  it("stamps every verdict with the time it was evaluated", async () => {
    const verdict = await evaluate(input, deps(judgment(0.97, 0.95)));
    expect(Number.isNaN(Date.parse(verdict.evaluatedAt))).toBe(false);
  });
});
