// Re-run the evaluator on stored runs, as the Re-evaluate button does: `npx dotenv -e .env.local -- npx tsx
// --conditions=react-server scripts/reevaluate.ts <runId> [...]`. For runs judged by an older version of the checks.
import { reevaluateRun } from "../src/lib/eval/reevaluate";

async function main() {
  for (const id of process.argv.slice(2)) {
    const v = await reevaluateRun(id);
    console.log(id, v.verdict, v.decidedBy ?? "", v.reasons[0] ?? "");
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
