// The evaluator against the real models, over the ten labelled runs in fixtures/llm-cases.json. Skipped unless
// EVAL=1, so `npm run check` never depends on a provider's good minute. Run:
//   EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/evaluate.eval.test.ts
// It writes docs/EVAL.md: the table is the evidence for the prompts and the thresholds, and the bar is 8 of 10.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EvaluateInput, Verdict } from "@/contracts/eval";
import { evaluateRun } from "./evaluate";

type Case = {
  id: string;
  input: {
    prompt: string;
    run_status: string;
    today: string;
    artifact: { name: string; source_file?: string; csv?: string; content?: string } | null;
    run_error?: string;
    last_tool_error?: string;
    tools_used?: string[];
    connection?: { id: string; enabled: boolean };
  };
  expected: { verdict: string; failed_checks?: string[]; reason_contains?: string; note_contains?: string };
  why: string;
};

const cases: Case[] = JSON.parse(readFileSync("fixtures/llm-cases.json", "utf8"));

// The fixtures describe a run, not an EvaluateInput: the artifact is inline or on disk, and what the engine would
// have put in the agent's report (the error that stopped it, the tools it used) is assembled here in one place.
function toInput(c: Case): EvaluateInput {
  const a = c.input.artifact;
  const content = a ? (a.source_file ? readFileSync(a.source_file, "utf8") : (a.csv ?? a.content ?? "")) : "";
  const report = [
    c.input.run_error ? `Run ended: ${c.input.run_error}` : a ? `Wrote ${a.name}.` : "Nothing was written.",
    c.input.last_tool_error ? `Last tool error: ${c.input.last_tool_error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    prompt: c.input.prompt,
    runStatus: c.input.run_status,
    report,
    plan: null, // the fixtures carry no plan: the judge sees the instructions, the report and the file
    files: a ? [{ name: a.name, content }] : [],
    today: c.input.today,
    toolsUsed: c.input.tools_used ?? [], // the evidence for "the connection was claimed but never called"
  };
}

// "not_applicable" in a fixture means there was nothing to evaluate; this evaluator says so with a pass.
const wanted = (c: Case) => (c.expected.verdict === "not_applicable" ? "pass" : c.expected.verdict);

describe.skipIf(process.env.EVAL !== "1")("evaluateRun over the labelled cases", () => {
  it("matches the expected verdict on at least 8 of the 10 runs", async () => {
    const rows: { id: string; want: string; got: string; ok: boolean; note: string }[] = [];
    for (const c of cases) {
      let verdict: Verdict | null = null;
      let note = "";
      try {
        verdict = await evaluateRun(toInput(c));
        note = [verdict.judgment ? `aQ=${verdict.judgment.answeredQuery} fP=${verdict.judgment.followedPlan}` : "", verdict.reasons[0] ?? ""]
          .filter(Boolean)
          .join(" - ");
      } catch (e) {
        note = `threw: ${e instanceof Error ? e.message : String(e)}`; // a throw here is a harness bug, not a score
      }
      const got = verdict?.verdict ?? "threw";
      rows.push({ id: c.id, want: wanted(c), got, ok: got === wanted(c), note: note.replaceAll("|", "/").slice(0, 160) });
    }
    const passed = rows.filter((r) => r.ok).length;
    writeFileSync("docs/EVAL.md", report(rows, passed));
    expect(passed, `${passed}/${cases.length}: ${rows.filter((r) => !r.ok).map((r) => `${r.id} wanted ${r.want} got ${r.got}`).join("; ")}`).toBeGreaterThanOrEqual(8);
  }, 240_000);
});

function report(rows: { id: string; want: string; got: string; ok: boolean; note: string }[], passed: number): string {
  return [
    "# Evaluator eval",
    "",
    `Ten labelled runs in \`fixtures/llm-cases.json\`, scored on the verdict. **${passed}/${rows.length}** as expected.`,
    "",
    "Run: `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/evaluate.eval.test.ts` (this file writes this table).",
    "",
    "| case | expected | got | ok | note |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.id} | ${r.want} | ${r.got} | ${r.ok ? "yes" : "NO"} | ${r.note} |`),
    "",
    `_Generated ${new Date().toISOString()}._`,
    "",
  ].join("\n");
}
