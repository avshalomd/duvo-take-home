import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Check, EvaluateInput, Judgment, Review, Verdict } from "./eval";
import { evaluateRun } from "../lib/eval/evaluate";
import runsFixture from "../../fixtures/runs.json";
import llmCases from "../../fixtures/llm-cases.json";

type FixtureCheck = { id: string; label: string; ok: boolean; detail: string };
type FixtureEvaluation = {
  verdict: string;
  score: number | null;
  checks: FixtureCheck[];
  reason: string;
} | null;
type FixtureRun = { id: string; prompt: string; status: string; evaluation: FixtureEvaluation };
const fixtureRuns = runsFixture as unknown as FixtureRun[];
const evaluations = fixtureRuns
  .map((r) => r.evaluation)
  .filter((e): e is NonNullable<FixtureEvaluation> => e !== null);

type FixtureCase = {
  id: string;
  input: {
    prompt: string;
    run_status: string;
    today: string;
    artifact: { name: string; csv?: string } | null;
  };
};
const fixtureCases = llmCases as unknown as FixtureCase[];

function aCase(id: string): FixtureCase {
  const found = fixtureCases.find((c) => c.id === id);
  if (!found) throw new Error(`fixtures/llm-cases.json has no case ${id}`);
  return found;
}

/** An eval case as the run loop will hand it to the evaluator: the fixture is snake_case, the contract is not. */
function toEvaluateInput(fixture: FixtureCase, report: string | null = null) {
  const artifact = fixture.input.artifact;
  return {
    prompt: fixture.input.prompt,
    runStatus: fixture.input.run_status,
    report,
    plan: null,
    files: artifact && artifact.csv ? [{ name: artifact.name, content: artifact.csv }] : [],
    today: fixture.input.today,
  };
}

/** The same object without one key, so a rejection names that key and nothing else. */
function omit<T extends object>(value: T, key: keyof T & string) {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy;
}

describe("Check", () => {
  it("accepts every check the fixture runs were evaluated with", () => {
    const checks = evaluations.flatMap((e) => e.checks);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) expect(Check.parse(check).id).toBe(check.id);
  });

  it('rejects a check whose ok is the string "true"', () => {
    expect(
      Check.safeParse({ id: "rows", label: "At least 8 rows", ok: "true", detail: "10 rows" }).success,
    ).toBe(false);
  });

  it("rejects a check without a detail: every check has to say why", () => {
    expect(Check.safeParse({ id: "rows", label: "At least 8 rows", ok: true }).success).toBe(false);
  });
});

describe("Judgment", () => {
  it("accepts the two probabilities Jev answers with", () => {
    const parsed = Judgment.parse({ answeredQuery: 0.92, followedPlan: 0.81 });
    expect(parsed.answeredQuery).toBe(0.92);
  });

  it("accepts the ends of the range", () => {
    expect(Judgment.parse({ answeredQuery: 0, followedPlan: 1 }).followedPlan).toBe(1);
  });

  it("rejects an answeredQuery above 1: it is a probability, not a score out of 100", () => {
    expect(Judgment.safeParse({ answeredQuery: 1.4, followedPlan: 0.8 }).success).toBe(false);
  });

  it("rejects a followedPlan that is a string", () => {
    expect(Judgment.safeParse({ answeredQuery: 0.9, followedPlan: "0.8" }).success).toBe(false);
  });
});

// Tier two: what the LLM review answers when Jev is not confident that the plan was followed.
const aReview = {
  taskFinished: true,
  responseSuitable: false,
  changeNeeded: "The CSV has 6 rows; the instructions asked for at least 8.",
  reasoning: "The file is well formed and on topic but short of the row floor the user named.",
};

describe("Review", () => {
  it("accepts a review that says the response is not usable as it is", () => {
    const parsed = Review.parse(aReview);
    expect(parsed.responseSuitable).toBe(false);
    expect(parsed.changeNeeded).toContain("8");
  });

  it("accepts a null changeNeeded when nothing has to change", () => {
    const parsed = Review.parse({ ...aReview, responseSuitable: true, changeNeeded: null });
    expect(parsed.changeNeeded).toBeNull();
  });

  it("rejects a review whose changeNeeded is missing rather than null", () => {
    expect(Review.safeParse(omit(aReview, "changeNeeded")).success).toBe(false);
  });

  it('rejects a taskFinished that is the string "yes"', () => {
    expect(Review.safeParse({ ...aReview, taskFinished: "yes" }).success).toBe(false);
  });

  it("rejects a review without reasoning: the escalation has to say why", () => {
    expect(Review.safeParse(omit(aReview, "reasoning")).success).toBe(false);
  });
});

describe("Verdict", () => {
  const fromFixture = () => {
    const evaluation = evaluations[0];
    return {
      verdict: evaluation.verdict,
      checks: evaluation.checks,
      judgment: { answeredQuery: 0.92, followedPlan: 0.9 },
      review: null,
      reasons: [evaluation.reason],
      evaluatedAt: "2026-09-22T09:14:45.000Z",
    };
  };

  it("accepts a verdict built from a fixture run's evaluation", () => {
    const parsed = Verdict.parse(fromFixture());
    expect(parsed.verdict).toBe("pass");
    expect(parsed.checks.length).toBeGreaterThan(0);
    expect(parsed.review).toBeNull(); // null when Jev was confident: no escalation to the LLM review
  });

  it("accepts a verdict that escalated to the LLM review", () => {
    const parsed = Verdict.parse({
      ...fromFixture(),
      verdict: "pass_with_notes",
      judgment: { answeredQuery: 0.71, followedPlan: 0.44 },
      review: aReview,
      reasons: [aReview.changeNeeded],
    });
    expect(parsed.review?.taskFinished).toBe(true);
  });

  it("rejects a verdict without review: a run either escalated or explicitly did not", () => {
    expect(Verdict.safeParse(omit(fromFixture(), "review")).success).toBe(false);
  });

  it("rejects a verdict whose review is half a Review", () => {
    expect(Verdict.safeParse({ ...fromFixture(), review: { taskFinished: true } }).success).toBe(false);
  });

  it("accepts unknown with a null judgment, which is what an unavailable judge leaves", () => {
    const parsed = Verdict.parse({ ...fromFixture(), verdict: "unknown", judgment: null });
    expect(parsed.judgment).toBeNull();
  });

  it("rejects a verdict of not_applicable, the value fixtures/runs.json uses for the no-artifact run", () => {
    expect(Verdict.safeParse({ ...fromFixture(), verdict: "not_applicable" }).success).toBe(false);
  });

  it("rejects a verdict whose reasons is one string instead of an array", () => {
    expect(Verdict.safeParse({ ...fromFixture(), reasons: "Every check passed" }).success).toBe(false);
  });

  it("rejects a verdict without evaluatedAt", () => {
    expect(Verdict.safeParse(omit(fromFixture(), "evaluatedAt")).success).toBe(false);
  });
});

describe("EvaluateInput", () => {
  it("accepts an eval case from fixtures/llm-cases.json", () => {
    const parsed = EvaluateInput.parse(toEvaluateInput(aCase("eval_wrong_columns")));
    expect(parsed.files).toHaveLength(1);
    expect(parsed.today).toBe("2026-09-22");
  });

  it("accepts an input that carries the plan the agent posted", () => {
    const input = toEvaluateInput(aCase("eval_wrong_columns"));
    const plan = {
      intent: "Collect this week's AI news into a CSV",
      expectedOutputs: ["output.csv"],
      sources: ["web search"],
      steps: [{ index: 0, title: "Write output.csv", status: "done" }],
    };
    expect(EvaluateInput.parse({ ...input, plan }).plan?.steps).toHaveLength(1);
  });

  it("accepts a run that wrote no file at all", () => {
    expect(EvaluateInput.parse(toEvaluateInput(aCase("eval_no_artifact"))).files).toHaveLength(0);
  });

  it("rejects a file entry without content", () => {
    const input = toEvaluateInput(aCase("eval_wrong_columns"));
    expect(EvaluateInput.safeParse({ ...input, files: [{ name: "output.csv" }] }).success).toBe(false);
  });

  it("rejects an input without today: the freshness checks need the date to be given, not read from the clock", () => {
    expect(EvaluateInput.safeParse(omit(toEvaluateInput(aCase("eval_wrong_columns")), "today")).success).toBe(
      false,
    );
  });

  it("rejects a report that is missing rather than null", () => {
    expect(
      EvaluateInput.safeParse(omit(toEvaluateInput(aCase("eval_wrong_columns")), "report")).success,
    ).toBe(false);
  });
});

describe("the evaluate stub", () => {
  it("answers a Verdict for a run that wrote a file", async () => {
    const input = EvaluateInput.parse(
      toEvaluateInput(aCase("eval_good"), "Wrote output.csv with 10 stories."),
    );
    const verdict = Verdict.parse(
      await evaluateRun({ ...input, files: [{ name: "output.csv", content: "title\nrow\n" }] }),
    );
    expect(verdict.checks.length).toBeGreaterThan(0);
    expect(z.array(Check).parse(verdict.checks)).toEqual(verdict.checks);
  });

  it("answers a Verdict with a reason for a run that wrote nothing", async () => {
    const input = EvaluateInput.parse(toEvaluateInput(aCase("eval_no_artifact")));
    const verdict = Verdict.parse(await evaluateRun(input));
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });
});
