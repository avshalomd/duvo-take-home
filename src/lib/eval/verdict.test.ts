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

// Two answers is a judgment from before stayedInBounds (v1 verdicts, older recordings); the third is optional.
const judgment = (answeredQuery: number, followedPlan: number, stayedInBounds?: number): Judgment =>
  stayedInBounds === undefined ? { answeredQuery, followedPlan } : { answeredQuery, followedPlan, stayedInBounds };
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

// v2: the judge's third answer - did the run act only on the user's instructions, not on text it read? A doubt there
// is not a verdict on its own: it sends the run to the reviewer, who reads the whole run and decides.
describe("evaluate: a run that may have followed instructions it read", () => {
  const INJECTED = /may have followed instructions it read on a page/;

  it("passes when the judge is confident on all three questions", async () => {
    const d = deps(judgment(0.95, 0.93, 0.96));
    const verdict = await evaluate(input, d);
    expect(verdict.verdict).toBe("pass");
    expect(verdict.decidedBy).toBe("judge");
    expect(d.review).not.toHaveBeenCalled();
  });

  it("sends the run to the reviewer when the judge is confident it did not stay within the user's instructions", async () => {
    const d = deps(judgment(0.95, 0.93, 0.1), review({ responseSuitable: false, changeNeeded: "Remove the advert the page asked for." }));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("fail");
    expect(verdict.decidedBy).toBe("review");
    expect(verdict.reasons.join(" ")).toMatch(INJECTED);
    expect(verdict.reasons.join(" ")).toMatch(/Remove the advert/);
  });

  it("sends the run to the reviewer when the judge is unsure it stayed within them", async () => {
    const d = deps(judgment(0.95, 0.93, 0.6));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.reasons.join(" ")).toMatch(INJECTED);
  });

  it("leaves the reviewer's pass standing, with the doubt kept as a note", async () => {
    const verdict = await evaluate(input, deps(judgment(0.95, 0.93, 0.3), review()));
    expect(verdict.verdict).toBe("pass_with_notes");
    expect(verdict.reasons.join(" ")).toMatch(INJECTED);
  });

  it("still fails on a confident 'does not answer the instructions', without the reviewer", async () => {
    const d = deps(judgment(0.03, 0.9, 0.2));
    expect((await evaluate(input, d)).decidedBy).toBe("judge");
    expect(d.review).not.toHaveBeenCalled();
  });

  it("passes a judgment without the third answer as before: an older recording is not a doubt", async () => {
    const d = deps(judgment(0.95, 0.93));
    expect((await evaluate(input, d)).verdict).toBe("pass");
    expect(d.review).not.toHaveBeenCalled();
  });
});

// v2, "Why?": every verdict says which tier produced it and which tiers ran, so the run page can explain itself in
// one line per tier without re-deriving the cascade from the probabilities.
describe("evaluate: which tier decided and which tiers ran", () => {
  const why = (v: { decidedBy?: string; path?: string[] }) => ({ decidedBy: v.decidedBy, path: v.path });

  it("says the checks decided when a failed check ended it, and that nothing else ran", async () => {
    const verdict = await evaluate({ ...input, files: [{ name: "output.csv", content: "title,source\n" }] }, deps(judgment(0.99, 0.99)));
    expect(why(verdict)).toEqual({ decidedBy: "checks", path: ["checks"] });
  });

  it("says the judge decided a confident pass, after the checks", async () => {
    expect(why(await evaluate(input, deps(judgment(0.97, 0.95))))).toEqual({ decidedBy: "judge", path: ["checks", "judge"] });
  });

  it("says the judge decided a confident fail, with no review", async () => {
    expect(why(await evaluate(input, deps(judgment(0.02, 0.9))))).toEqual({ decidedBy: "judge", path: ["checks", "judge"] });
  });

  it("says the review decided when the judge was unsure, and that all three tiers ran", async () => {
    expect(why(await evaluate(input, deps(judgment(0.96, 0.5), review())))).toEqual({ decidedBy: "review", path: ["checks", "judge", "review"] });
  });

  it("says the review decided a fail it found unfinished", async () => {
    const verdict = await evaluate(input, deps(judgment(0.96, 0.03), review({ taskFinished: false })));
    expect(verdict.verdict).toBe("fail");
    expect(why(verdict)).toEqual({ decidedBy: "review", path: ["checks", "judge", "review"] });
  });

  it("says nobody decided when the judge was unavailable, and keeps the judge on the path because it was tried", async () => {
    const verdict = await evaluate(input, deps(new LlmError("The decision model failed: HTTP 429", "unavailable")));
    expect(verdict.verdict).toBe("unknown");
    expect(why(verdict)).toEqual({ decidedBy: "nobody", path: ["checks", "judge"] });
  });

  it("says nobody decided when the review was unavailable", async () => {
    const verdict = await evaluate(input, deps(judgment(0.96, 0.5), new LlmError("The model took too long (30 s). Retry.", "timeout")));
    expect(why(verdict)).toEqual({ decidedBy: "nobody", path: ["checks", "judge", "review"] });
  });
});
