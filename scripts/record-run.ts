// Records a run from the database as a case of the evaluator's offline suite - a test of the evaluator, not a
// product feature. Writes fixtures/runs/<case>.json: the run, its events and files, the automation's template (while
// it still has the run's version), and the judge's and the reviewer's answers from the run's stored verdict.
// The expected verdict and tier are left for a person to fill in; until they are, the replayed suite fails on the file.
//   npx dotenv -e .env.local -- npx tsx scripts/record-run.ts <runId> [case-id]
// Read the file before committing it: it holds the run's prompt, report and files as they are in the database.
// It builds its own client because `@/db` imports `server-only`, which throws outside Next (as scripts/seed.ts does).
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { Verdict } from "../src/contracts/eval";
import * as schema from "../src/db/schema";
import { templateOf, toEvents, toFiles, toRun } from "../src/lib/eval/run-rows";
import { CASES_DIR, type SuiteCase } from "../src/lib/eval/suite-case";

const [runId, caseArg] = process.argv.slice(2);
if (!runId) throw new Error("usage: npx dotenv -e .env.local -- npx tsx scripts/record-run.ts <runId> [case-id]");

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

async function main() {
  const [row] = await db.select().from(schema.runs).where(eq(schema.runs.id, runId)).limit(1);
  if (!row) throw new Error(`No run ${runId} in this database.`);
  const eventRows = await db.select().from(schema.runEvents).where(eq(schema.runEvents.runId, runId)).orderBy(asc(schema.runEvents.seq));
  const fileRows = await db.select().from(schema.files).where(eq(schema.files.runId, runId));
  const [automation] =
    row.automationId && row.workspaceId
      ? await db
          .select({ template: schema.automations.template, version: schema.automations.version })
          .from(schema.automations)
          .where(and(eq(schema.automations.id, row.automationId), eq(schema.automations.workspaceId, row.workspaceId)))
          .limit(1)
      : [];
  const stored = Verdict.safeParse(row.verdict);
  const verdict = stored.success ? stored.data : null;

  const id = caseArg ?? slug(row.prompt);
  const file = path.join(CASES_DIR, `${id}.json`);
  if (existsSync(file)) throw new Error(`${file} exists already; pass another case id as the second argument.`);

  // The labels are strings a person replaces: the suite's schema rejects them, so an unlabelled case cannot pass.
  const draft: Omit<SuiteCase, "expected"> & { expected: { verdict: string; decidedBy: string; failedChecks: string[] } } = {
    id,
    why: "FILL IN: what this case is here to catch, in one or two sentences",
    source: `scripts/record-run.ts from run ${runId} on ${new Date().toISOString().slice(0, 10)}; its stored verdict was ${
      verdict ? `${verdict.verdict}${verdict.decidedBy ? `, decided by ${verdict.decidedBy}` : ""}, failed checks: ${failedIds(verdict) || "none"}` : "missing"
    }`,
    expected: {
      verdict: "FILL IN: pass | pass_with_notes | fail | unknown",
      decidedBy: "FILL IN: checks | judge | review | nobody",
      failedChecks: [],
    },
    recorded: {
      judge: verdict?.judgment ?? null,
      review: verdict?.review ?? null,
      source: verdict ? `the run's stored verdict, evaluated ${verdict.evaluatedAt}` : "no stored verdict",
    },
    run: toRun(row),
    events: toEvents(eventRows),
    files: toFiles(fileRows),
    template: templateOf(row, automation),
  };
  writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
  console.log(`wrote ${file} (${draft.events.length} events, ${draft.files.length} files${draft.template ? ", with its template" : ""})`);
  console.log("next: fill in why, expected.verdict, expected.decidedBy and expected.failedChecks, then run npm run check");
}

/** "Fetch the latest AI news ..." -> "fetch-the-latest-ai-news": the first words of the prompt, file-name safe. */
function slug(prompt: string): string {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").split("-").filter(Boolean).slice(0, 6).join("-") || "recorded-run";
}

const failedIds = (v: Verdict) => v.checks.filter((c) => !c.ok).map((c) => c.id).join(", ");

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
