import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AutomationTemplate } from "@/contracts/automation";
import { Judgment, Review, VerdictKind, type EvaluateInput } from "@/contracts/eval";
import { Run, RunEvent } from "@/contracts/run";
import type { EvaluateDeps } from "./evaluate";
import { toEvaluateInput } from "./run-rows";

// The offline suite's case file: a TEST of the evaluator, not a product feature. One file in fixtures/runs/ is one
// recorded run (the rows the database holds for it), the verdict a person expects, and the answers the judge and the
// reviewer gave when it was recorded. The replayed suite feeds those answers back, so it tests the code (checks,
// thresholds, the order of the tiers); the live suite asks the models again, so it measures them.

export const CASES_DIR = "fixtures/runs";

export const SuiteCase = z.object({
  id: z.string(),
  why: z.string(), // what this case is here to catch, in one or two sentences
  source: z.string(), // where the recording came from: a seed run, a labelled v1 case, record-run.ts, or by hand
  expected: z.object({
    verdict: VerdictKind,
    decidedBy: z.enum(["checks", "judge", "review", "nobody"]),
    failedChecks: z.array(z.string()).default([]), // the ids of the code checks that must fail, in any order
  }),
  recorded: z.object({
    judge: Judgment.nullable(), // null: the judge was not reached when the case was recorded
    review: Review.nullable(),
    source: z.string(), // "live <date>" or why the answers were set by hand
  }),
  run: Run,
  events: z.array(RunEvent),
  files: z.array(z.object({ name: z.string(), content: z.string() })),
  template: AutomationTemplate.nullable().default(null), // the saved automation's template, for a run of one
});
export type SuiteCase = z.infer<typeof SuiteCase>;

export type LoadedCase = SuiteCase & { file: string }; // the path it came from, so a live run can record into it

/** Every case in fixtures/runs/, sorted by file name. A file that does not parse throws with its name. */
export function loadCases(dir = CASES_DIR): LoadedCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const parsed = SuiteCase.safeParse(JSON.parse(readFileSync(file, "utf8")));
      // record-run.ts leaves expected.verdict for a person to fill in: an unlabelled case is not a test yet
      if (!parsed.success) throw new Error(`${file}: ${z.prettifyError(parsed.error)}`);
      return { ...parsed.data, file };
    });
}

/** The evaluator's input for a case: the same mapping Re-evaluate uses on a stored run, plus the template. */
export function caseInput(c: SuiteCase): EvaluateInput {
  return { ...toEvaluateInput(c.run, c.events, c.files), template: c.template };
}

/**
 * The judge and the reviewer replaced by what they answered when the case was recorded. A tier asked for an answer
 * the recording does not have throws, and evaluate() turns that into "unknown" with this reason: it means the code
 * now routes the case differently from when it was recorded, which is exactly what the replay is there to show.
 */
export function replayDeps(c: SuiteCase): EvaluateDeps {
  return {
    judge: async () => {
      if (!c.recorded.judge) throw new Error(`${c.id}: the recording has no judge answer (the checks decided it when it was recorded)`);
      return c.recorded.judge;
    },
    review: async () => {
      if (!c.recorded.review) throw new Error(`${c.id}: the recording has no review answer (it was not escalated when it was recorded)`);
      return c.recorded.review;
    },
  };
}
