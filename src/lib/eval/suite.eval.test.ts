// The offline suite, live: the same recorded runs as suite.test.ts, but the judge (Jev) and the reviewer (an LLM)
// are asked for real, so what is measured is the models and their prompts. Skipped unless EVAL=1, so `npm run check`
// never depends on a provider's good minute. It writes docs/EVAL.md with both tables. Run:
//   EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/suite.eval.test.ts
// With RECORD=1 as well, every case whose live verdict and tier match its label gets the live answers as its
// recording, so the replayed suite keeps replaying what the models really say.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Judgment, Review, Verdict } from "@/contracts/eval";
import { evaluate } from "./evaluate";
import { judgeRun } from "./judge";
import { reviewRun } from "./review";
import { caseInput, loadCases, replayDeps, type LoadedCase } from "./suite-case";
import { suiteReport, type Row } from "./suite-report";

const cases = loadCases();
type Answers = { judge: Judgment | null; review: Review | null };

describe.skipIf(process.env.EVAL !== "1")("the offline suite, live", () => {
  it("runs the real judge and reviewer over every case and writes docs/EVAL.md", async () => {
    const replayed: Row[] = [];
    for (const c of cases) replayed.push(row(c, await evaluate(caseInput(c), replayDeps(c)), c.recorded, false));

    const live: Row[] = [];
    for (const c of cases) {
      const answers: Answers = { judge: null, review: null };
      const verdict = await evaluate(caseInput(c), {
        judge: async (input) => (answers.judge = await judgeRun(input)),
        review: async (input) => (answers.review = await reviewRun(input)),
      });
      const r = row(c, verdict, answers, true);
      live.push(r);
      if (process.env.RECORD === "1" && r.outcome === "ok" && r.gotDecidedBy === c.expected.decidedBy && answers.judge) record(c, answers);
    }

    writeFileSync("docs/EVAL.md", suiteReport({ replayed, live, generatedAt: new Date().toISOString() }));
    // A case with no answer is a provider or harness problem, not a score: it fails the run so nobody reads the rate.
    expect(live.filter((r) => r.outcome === "error").map((r) => `${r.id}: ${r.reason}`)).toEqual([]);
    const hits = live.filter((r) => r.outcome === "ok").length;
    const misses = live.filter((r) => r.outcome === "miss").map((r) => `${r.id} wanted ${r.expected} got ${r.got}`);
    expect(hits, misses.join("; ")).toBeGreaterThanOrEqual(Math.ceil(cases.length * 0.8)); // the bar v1 set: 8 in 10
  }, 900_000);
});

function row(c: LoadedCase, verdict: Verdict, answers: Answers, live: boolean): Row {
  // Live, an "unknown" nobody decided means a model did not answer: that is not the model's judgment being wrong.
  const noAnswer = live && verdict.decidedBy === "nobody" && c.expected.decidedBy !== "nobody";
  const ok = verdict.verdict === c.expected.verdict && (live || verdict.decidedBy === c.expected.decidedBy);
  return {
    id: c.id,
    why: c.why,
    expected: c.expected.verdict,
    expectedDecidedBy: c.expected.decidedBy,
    got: verdict.verdict,
    gotDecidedBy: verdict.decidedBy ?? "?",
    failedChecks: verdict.checks.filter((check) => !check.ok).map((check) => check.id),
    judge: answers.judge,
    review: answers.review,
    reason: verdict.reasons[0] ?? "",
    outcome: noAnswer ? "error" : ok ? "ok" : "miss",
  };
}

// The raw file is rewritten, not the parsed case, so fields the schema fills in by default are not added to it.
function record(c: LoadedCase, answers: Answers) {
  const raw = JSON.parse(readFileSync(c.file, "utf8"));
  raw.recorded = { judge: answers.judge, review: answers.review, source: `live ${new Date().toISOString().slice(0, 10)}` };
  writeFileSync(c.file, `${JSON.stringify(raw, null, 2)}\n`);
}
