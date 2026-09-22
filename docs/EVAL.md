# Evaluator eval

Ten labelled runs in `fixtures/llm-cases.json`, scored on the verdict. **10/10** as expected.

Run: `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/evaluate.eval.test.ts` (this file writes this table).

| case | expected | got | ok | note |
| --- | --- | --- | --- | --- |
| eval_good | pass | pass | yes | aQ=0.9 fP=0.81 |
| eval_empty_csv | fail | fail | yes | The CSV has rows: output.csv has a header and no rows |
| eval_wrong_columns | fail | fail | yes | The columns the instructions named are there: missing columns: title, source, url, published_at, summary |
| eval_stale_dates | fail | fail | yes | The rows are from the last 7 days: 8 of 8 rows are not from the last 7 days, oldest 2024-02-15 |
| eval_duplicate_rows | fail | fail | yes | No row is a duplicate of another: 8 rows, 4 distinct urls |
| eval_off_topic | fail | fail | yes | aQ=0.02 fP=0.08 - The files and report do not answer the instructions (98% confident). |
| eval_mixed_topic_ambiguous | pass_with_notes | pass_with_notes | yes | aQ=0.72 fP=0.71 - The CSV contains all required columns (title, source, url, published_at, summary) and 9 data rows, meeting the 'at least 8' requirement. Eight |
| eval_no_artifact | fail | fail | yes | The run finished: run status failed - Run ended: error_max_turns Last tool error: API Error 400: web_search is not enabled for this organization |
| eval_malformed_csv | fail | fail | yes | The CSV parses: output.csv: Invalid Closing Quote: got "U" at line 2 instead of delimiter, record delimiter, trimable character (if activated) or comment |
| eval_connection_claimed_not_used | fail | fail | yes | The DeepWiki connection was used: no mcp__deepwiki__ tool call; tools used: WebFetch, Write |

## The code checks under the table

Every case above is decided by the free checks first (`src/lib/eval/checks.ts`), and only a file that passes
all of them costs a model call: `completed`, `connection_used`, `file_expected`, `extension`, `parses`,
`rows`, `columns`, `urls`, `duplicates`, `freshness`. Each names the rows it could not read in its own detail,
so a green tick never hides a row nobody looked at.

Two cases QA asked for (Q77) are pinned as unit cases in `src/lib/eval/checks.test.ts` rather than here: a CSV
with a ragged row must fail `parses` by row number and field count, and a url column holding a non-URL must be
named by `urls`. Both are decided without a model, so the labelled set would spend a model call to prove nothing.

_Generated 2026-09-22T11:00:26.103Z._
