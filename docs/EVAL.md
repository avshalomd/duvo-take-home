# Evaluator eval

Ten labelled runs in `fixtures/llm-cases.json`, scored on the verdict. **9/10** as expected.

Run: `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/evaluate.eval.test.ts` (this file writes this table).

| case | expected | got | ok | note |
| --- | --- | --- | --- | --- |
| eval_good | pass | pass_with_notes | NO | The CSV has all required columns (title, source, url, published_at, summary) with no placeholders, at least 10 rows (file totals 12 lines = header + 11 rows), e |
| eval_empty_csv | fail | fail | yes | The CSV has rows: output.csv has a header and no rows |
| eval_wrong_columns | fail | fail | yes | The columns the instructions named are there: missing columns: title, source, url, published_at, summary |
| eval_stale_dates | fail | fail | yes | The rows are from the last 7 days: 8 of 8 rows are older than 7 days (oldest 2024-02-15) |
| eval_duplicate_rows | fail | fail | yes | No row is a duplicate of another: 8 rows, 4 distinct urls |
| eval_off_topic | fail | fail | yes | The files and report do not answer the instructions (98% confident). - aQ=0.02 fP=0.07 |
| eval_mixed_topic_ambiguous | pass_with_notes | pass_with_notes | yes | The CSV has the required five columns and 9 rows, exceeding the 8-row minimum, with plausible titles, sources, URLs and dates all falling before the stated TODA |
| eval_no_artifact | fail | fail | yes | The run finished: run status failed - Run ended: error_max_turns Last tool error: API Error 400: web_search is not enabled for this organization |
| eval_malformed_csv | fail | fail | yes | The CSV parses: output.csv: Invalid Closing Quote: got "U" at line 2 instead of delimiter, record delimiter, trimable character (if activated) or comment |
| eval_connection_claimed_not_used | fail | fail | yes | The judge was unsure whether the work answers the instructions (80%). - aQ=0.8 fP=0.62 |

_Generated 2026-09-22T09:16:44.051Z._
