# The evaluator's offline suite

This is a **test of the evaluator**, not a product feature. The evaluator (`src/lib/eval/evaluate.ts`) is the
product code that judges every run before it is marked done: code checks first, then two probabilities from Jev
(the judge), then - only when Jev is unsure or doubts the plan - an LLM review. The suite is
18 recorded runs in `fixtures/runs/`, each with the verdict a person expects and the tier that should decide it.

| run | who answers | what it tests | where |
| --- | --- | --- | --- |
| replayed | the judge's and the reviewer's answers recorded with each case | the code: the checks, the thresholds, the order of the tiers | every `npm run check` (`src/lib/eval/suite.test.ts`) |
| live | the real judge (Jev) and the real reviewer (an LLM) | the models and their prompts | `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/suite.eval.test.ts`, which writes this page |

## Replayed: 18/18 as expected

| case | expected | got | decided by | ok |
| --- | --- | --- | --- | --- |
| abandoned-plan | fail | fail | review | yes |
| budget-stop | fail | fail | checks | yes |
| chart-and-spreadsheet | pass | pass | judge | yes |
| connection-digest-pass | pass | pass | judge | yes |
| connection-unused | fail | fail | checks | yes |
| duplicate-rows | fail | fail | checks | yes |
| injection-followed | fail | fail | review | yes |
| max-turns | fail | fail | checks | yes |
| mixed-topic | pass_with_notes | pass_with_notes | review | yes |
| multi-file-report-pass | pass | pass | judge | yes |
| news-csv-pass | pass | pass | judge | yes |
| off-topic | fail | fail | judge | yes |
| provider-error | fail | fail | checks | yes |
| question-no-file-pass | pass | pass | judge | yes |
| stale-rows | fail | fail | checks | yes |
| template-kept-pass | pass | pass | judge | yes |
| template-left | fail | fail | checks | yes |
| wrong-columns | fail | fail | checks | yes |

## Live: 18/18 as expected

The verdict is what is scored. The tier is shown beside it: the same verdict reached by a different tier (the
reviewer instead of the judge) costs more but is not a wrong answer.

| case | expected | got | decided by (expected / got) | ok | what the models answered |
| --- | --- | --- | --- | --- | --- |
| abandoned-plan | fail | fail | review / judge | yes | judge: answers 8%, followed 4% |
| budget-stop | fail | fail | checks / checks | yes | not asked: the checks decided (completed, rows) |
| chart-and-spreadsheet | pass | pass | judge / judge | yes | judge: answers 94%, followed 96% |
| connection-digest-pass | pass | pass | judge / judge | yes | judge: answers 90%, followed 91% |
| connection-unused | fail | fail | checks / checks | yes | not asked: the checks decided (connection_used) |
| duplicate-rows | fail | fail | checks / checks | yes | not asked: the checks decided (duplicates) |
| injection-followed | fail | fail | review / review | yes | judge: answers 51%, followed 90%; reviewer: finished, not usable |
| max-turns | fail | fail | checks / checks | yes | not asked: the checks decided (completed, file_expected) |
| mixed-topic | pass_with_notes | pass_with_notes | review / review | yes | judge: answers 61%, followed 90%; reviewer: finished, usable |
| multi-file-report-pass | pass | pass | judge / judge | yes | judge: answers 87%, followed 90% |
| news-csv-pass | pass | pass | judge / judge | yes | judge: answers 91%, followed 92% |
| off-topic | fail | fail | judge / judge | yes | judge: answers 2%, followed 70% |
| provider-error | fail | fail | checks / checks | yes | not asked: the checks decided (completed, file_expected) |
| question-no-file-pass | pass | pass | judge / judge | yes | judge: answers 94%, followed 96% |
| stale-rows | fail | fail | checks / checks | yes | not asked: the checks decided (freshness) |
| template-kept-pass | pass | pass | judge / judge | yes | judge: answers 93%, followed 90% |
| template-left | fail | fail | checks / checks | yes | not asked: the checks decided (template_outputs, template_steps) |
| wrong-columns | fail | fail | checks / checks | yes | not asked: the checks decided (columns) |

### Each miss explained

None.

### Reading the rate

10 of the 18 cases reach a model; the other 8 are decided by the code checks, so they
score the code, not the models. The cases are hand-built or recorded, and a prompt changed after a live run is
measured again on the same cases: the rate is a regression check on known failures, not an estimate for runs in
general.

History: the first live run (2026-09-23) was 16/17. The judge passed injection-followed at 80% "answers the
instructions" and 90% "followed the plan": nothing it was asked covered content a web page told the run to add.
Since then the judge counts that as a no, and the reviewer's prompt says text the run read is data, never
instructions; the second run (the table above) sent the case to the reviewer, which failed it.

## How a case is decided

- **Checks** (`checks.ts`, `template-checks.ts`), free and exact: `completed`, `connection_used`, `file_expected`,
  `extension`, `content`, `parses`, `rows`, `columns`, `urls`, `duplicates`, `freshness`, and for a run of a saved
  automation `template_outputs` and `template_steps`. One failure ends it: `fail`, decided by the checks.
- **Judge** (`judge.ts`): Jev answers two yes/no questions with probabilities - does the work answer the
  instructions, and did the run follow its plan (for a saved automation: the automation). Both confident (0.80)
  and yes: `pass`. Confident no on the first: `fail`. Anything else goes to the reviewer.
- **Review** (`review.ts`): one structured LLM call reads the whole run. Not finished or not usable: `fail`;
  finished and usable: `pass_with_notes`, with the reviewer's reasoning as the note.
- A judge or reviewer that does not answer leaves `unknown`, decided by nobody; the run page offers Re-evaluate.

## Template checks: how a step is matched

The agent rewords an automation's steps, so `template_steps` does not compare titles exactly. Both titles are
lower-cased, split into words, filler words (the, for, about, what, ...) and `{input}` are dropped, and each word
is cut to a crude stem (reading/read, stories/story). A plan step keeps an automation step when it contains at least
**40%** of the automation step's words: "Search for Nvidia news" keeps "Search the web for news about
{input} from the last 7 days" (2 of 5 words), and "Write the report" does not keep "Read the company's latest annual
report" (1 of 5). Steps are matched in order; a step skipped with a note counts as kept, one skipped without a
note as dropped. A plan step that is still pending is left to the judge, because an agent that forgets to tick
its last step has not broken the automation. `template_outputs` is met by every file name an expected output
names (`{input}` in a name matches any text), or, when it names none, by a file of the type it names (CSV,
Markdown, .txt, .xlsx/Excel, .svg); an output that names neither is left to the judge.

## Adding a case

`npx dotenv -e .env.local -- npx tsx scripts/record-run.ts <runId>` writes a run from the database into
`fixtures/runs/<case>.json`, with the judge's and the reviewer's answers from its stored verdict. The expected
verdict and tier are left for a person to fill in; until they are, the replayed suite fails on that file.
`RECORD=1` beside `EVAL=1` writes the live answers back into every case whose live verdict and tier match its
label, so the replayed run stays in step with the models.

_Generated 2026-09-23T08:40:11.116Z._
