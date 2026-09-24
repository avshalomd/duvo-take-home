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

  // qa-ai F4: a judge-only fail said nothing the agent could act on, and it failed truthful refusals at 95%. It goes to
  // the reviewer, whose fail names the change to make.
  it("sends a confident 'does not answer the instructions' to the reviewer, whose fail names the change", async () => {
    const d = deps(judgment(0.02, 0.9), review({ responseSuitable: false, changeNeeded: "Answer the question about Norway, not Sweden." }));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("fail");
    expect(verdict.decidedBy).toBe("review");
    expect(verdict.reasons.join(" ")).toMatch(/Answer the question about Norway/);
  });

  it("lets the reviewer pass, with notes, a result the judge was sure did not answer", async () => {
    const verdict = await evaluate(input, deps(judgment(0.02, 0.9), review()));
    expect(verdict.verdict).toBe("pass_with_notes");
  });

  it("escalates to the review when the judge says the plan was not followed", async () => {
    const d = deps(judgment(0.96, 0.03));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.review).not.toBeNull();
  });

  it("hands the reviewer the checks the run passed, so it can see which rules are fixed (Q148)", async () => {
    const d = deps(judgment(0.96, 0.5));
    await evaluate(input, d);
    const [, checks] = d.review.mock.calls[0] as unknown as [EvaluateInput, { id: string; ok: boolean }[]];
    expect(checks.map((c) => c.id)).toContain("parses");
    expect(checks.every((c) => c.ok)).toBe(true);
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

  it("sends a confident 'does not answer the instructions' to the reviewer too", async () => {
    const d = deps(judgment(0.03, 0.9, 0.2), review({ responseSuitable: false, changeNeeded: "Remove the advert." }));
    expect((await evaluate(input, d)).decidedBy).toBe("review");
    expect(d.review).toHaveBeenCalledOnce();
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

  it("says the review decided a fail the judge was sure of, after all three tiers", async () => {
    const r = review({ responseSuitable: false, changeNeeded: "Answer the question asked." });
    expect(why(await evaluate(input, deps(judgment(0.02, 0.9), r)))).toEqual({ decidedBy: "review", path: ["checks", "judge", "review"] });
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

// Engine review #1: the run boxes its evaluation at 50 s, but the judge had 20 s per route (three on Vercel) and the
// reviewer 45 s per try, so two slow routes spent the whole box on the judge and the run said "not checked".
describe("evaluate inside a time box", () => {
  it("gives the judge the box less the reviewer's share, and the reviewer the whole box", async () => {
    const d = deps(judgment(0.96, 0.5)); // unsure about the plan: the reviewer is asked too
    const before = Date.now();
    await evaluate(input, d, { withinMs: 50_000 });
    const judgeLeft = (d.judge.mock.calls[0] as unknown[])[1] as { endsAt: number };
    const reviewLeft = (d.review.mock.calls[0] as unknown[])[2] as { endsAt: number };
    expect(judgeLeft.endsAt - before).toBeGreaterThanOrEqual(30_000 - 50);
    expect(judgeLeft.endsAt - before).toBeLessThanOrEqual(30_000 + 50);
    expect(reviewLeft.endsAt - before).toBeLessThanOrEqual(50_000 + 50);
    expect(reviewLeft.endsAt - judgeLeft.endsAt).toBe(20_000); // the reviewer's share is never spent by the judge
  });

  it("sets no deadline without a box, so Re-evaluate keeps each tier's own timeouts", async () => {
    const d = deps(judgment(0.96, 0.5));
    await evaluate(input, d);
    expect((d.judge.mock.calls[0] as unknown[])[1]).toBeUndefined();
    expect((d.review.mock.calls[0] as unknown[])[2]).toBeUndefined();
  });
});

// qa-ai F3 (the owner's call): a truthful "I cannot do this" (no mailbox access) or "what do you mean by the best
// ones?" was failed at 90-95% and healed twice. Jev picks what the run did, in the same request; the two answers that
// are not the work end in their own neutral outcomes, never healed.
describe("evaluate: a run that could not be done, or needs the person's answer", () => {
  const handled = (choice: NonNullable<Judgment["handling"]>["choice"], confidence: number): Judgment => ({
    answeredQuery: 0.1,
    followedPlan: 0.9,
    handling: { choice, confidence },
  });
  const question: EvaluateInput = { ...input, prompt: "Log into my Outlook and list my manager's unread mail as to-dos.", files: [], report: "I cannot open your mailbox." };

  it("is 'could not be done' when the judge is sure the run truthfully explained it cannot be done", async () => {
    const d = deps(handled("cannot_be_done", 0.93));
    const verdict = await evaluate(question, d);
    expect(verdict.verdict).toBe("cannot_do");
    expect(verdict.decidedBy).toBe("judge");
    expect(verdict.path).toEqual(["checks", "judge"]);
    expect(d.review).not.toHaveBeenCalled();
  });

  it("is 'needs your answer' when the judge is sure the run asked the person for what only they know", async () => {
    const verdict = await evaluate({ ...question, prompt: "Make me a list of the best ones for our team." }, deps(handled("needs_information", 0.9)));
    expect(verdict.verdict).toBe("needs_answer");
    expect(verdict.decidedBy).toBe("judge");
  });

  it("leaves a run the judge is sure did the work to the other answers", async () => {
    const verdict = await evaluate(input, deps({ answeredQuery: 0.95, followedPlan: 0.95, handling: { choice: "did_work", confidence: 0.97 } }));
    expect(verdict.verdict).toBe("pass");
  });

  it("asks the reviewer when the judge leans to a refusal but is unsure, and takes the refusal when the reviewer finds it right", async () => {
    const d = deps(handled("cannot_be_done", 0.6), review({ reasoning: "It has no access to the mailbox and says so." }));
    const verdict = await evaluate(question, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("cannot_do");
    expect(verdict.decidedBy).toBe("review");
  });

  it("asks the judge about a run whose only failed check is the missing file: a refusal writes none", async () => {
    const d = deps(handled("cannot_be_done", 0.92));
    const verdict = await evaluate({ ...question, prompt: "Log into my Outlook and save my manager's unread mail as todo.csv." }, d);
    expect(d.judge).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("cannot_do");
    expect(verdict.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(["file_expected"]);
  });

  it("keeps the checks' fail when the run with no file did not refuse", async () => {
    const d = deps({ answeredQuery: 0.5, followedPlan: 0.9, handling: { choice: "did_work", confidence: 0.9 } });
    const verdict = await evaluate({ ...question, prompt: "Save the list as todo.csv." }, d);
    expect(verdict.verdict).toBe("fail");
    expect(verdict.decidedBy).toBe("checks");
    expect(verdict.path).toEqual(["checks"]);
    expect(d.review).not.toHaveBeenCalled();
  });

  it("asks no model when a check other than the missing file failed", async () => {
    const d = deps(handled("cannot_be_done", 0.95));
    await evaluate({ ...input, files: [{ name: "output.csv", content: "title,source\n" }] }, d);
    expect(d.judge).not.toHaveBeenCalled();
  });
});

// qa-ai F2 (the owner's call): nothing asked whether the numbers were right, so "20 working days" with two invented
// Norwegian holidays passed at 0.86. A fourth answer in the same request, and plain questions answered with facts or
// numbers always get the reviewer's reading.
describe("evaluate: numbers and facts", () => {
  const plainQuestion: EvaluateInput = { ...input, prompt: "How many working days does Norway have in October 2026?", files: [], report: "22 working days." };

  it("sends a run whose numbers or facts may not agree with the instructions or the sources to the reviewer", async () => {
    const d = deps({ answeredQuery: 0.95, followedPlan: 0.95, factsAgree: 0.4 }, review({ responseSuitable: false, changeNeeded: "Recompute the total: 1991.25, not 1919.25." }));
    const verdict = await evaluate(input, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("fail");
    expect(verdict.reasons.join(" ")).toMatch(/numbers or facts/);
  });

  it("always has the reviewer read a plain question answered with facts or numbers and no file", async () => {
    const d = deps({ answeredQuery: 0.95, followedPlan: 0.95, factsAgree: 0.9, statesFacts: 0.9 }, review({ responseSuitable: false, changeNeeded: "Norway has no public holiday in October." }));
    const verdict = await evaluate(plainQuestion, d);
    expect(d.review).toHaveBeenCalledOnce();
    expect(verdict.verdict).toBe("fail");
    expect(verdict.decidedBy).toBe("review");
  });

  it("calls such an answer a plain pass when the reviewer finds it right: nobody was unsure of it", async () => {
    const verdict = await evaluate(plainQuestion, deps({ answeredQuery: 0.95, followedPlan: 0.95, factsAgree: 0.9, statesFacts: 0.9 }, review()));
    expect(verdict.verdict).toBe("pass");
    expect(verdict.decidedBy).toBe("review");
  });

  it("passes a plain answer with no facts or numbers on the judge's word", async () => {
    const d = deps({ answeredQuery: 0.95, followedPlan: 0.95, factsAgree: 0.9, statesFacts: 0.1 });
    expect((await evaluate(plainQuestion, d)).verdict).toBe("pass");
    expect(d.review).not.toHaveBeenCalled();
  });
});
