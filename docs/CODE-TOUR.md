# Code tour

Per file: what it does and why it is built that way. Grows at every merge.

## Contracts and skeleton (WP0)

- `src/contracts/run.ts` - the run, its events and the derived state. `RunEvent` is a discriminated union on `kind` with loose payloads: the SDK adds fields between versions and we keep what it sent, validating only what the code reads. The plan is an event kind, so the key state at any point is the last plan event plus the calls since: nothing is stored twice.
- `src/contracts/agent.ts` - what the form sends, the plan tool's inputs (raw Zod shapes, because the SDK's `tool()` takes a shape) and the limits (turns, budget, wall clock, file extensions) as one constant, so the caps are read in one place.
- `src/contracts/eval.ts` - the seam between the judge and the code that closes a run: Jev's answers are probabilities, the LLM review is a small schema, the verdict carries both plus every code check, so a pass or fail can be defended later.
- `src/contracts/connection.ts` - the UI shape never carries the token (`hasToken`); only the server-side `ConnectionSecret` does, and only to build the agent's `mcpServers`.
- `src/db/schema.ts` - four tables beside the baseline `notes`. `runs.verdict` is jsonb, stored whole. `run_events(run_id, seq)` is the only index the reads need. `files.content` is text: a CSV needs no blob store.
- `scripts/seed.ts` - loads the fixture runs, events, files and connections so every screen demos when the model is down. Its own client, because `@/db` is server-only.
- `next.config.ts` - `serverExternalPackages` for the Agent SDK: it carries the Claude Code binary and must not be bundled.

## P4 - connections

- `src/lib/connections/store.ts` - Drizzle on the `connections` table. `toConnection()` is the one place a row loses its token: the UI shape gets `hasToken`, only `listEnabledConnectionsWithSecrets()` returns the token, and only the agent loop calls it.
- `src/lib/connections/key.ts` - `connectionKey(name)`: the MCP server key from the user's name (lowercase, non-alphanumerics to `_`, empty falls back to `server`). The agent's tool names are `mcp__<key>__<tool>`, so the key in the trace and the name the user typed cannot drift.
- `src/lib/connections/store.int.test.ts` - the promises against the real table; every row it creates is named `[int] ...` and deleted after.

## P3 - eval

- `src/lib/eval/checks.ts` - the code checks, one function per check with a stable id (`completed`, `file_expected`, `extension`, `parses`, `rows`, `columns`, `duplicates`, `freshness`, `content`). Only applicable checks are emitted, so a question-only run is not failed for having no file. Freshness and duplicate URLs catch the two ways a model fakes a news CSV (recited training data, padded rows) with no model call.
- `src/lib/eval/judge.ts` - Jev through `decide()`: two `noul()` questions, answeredQuery and followedPlan, answered in one request as probabilities.
- `src/lib/eval/review.ts`, `review.prompt.ts` - tier two, `extract()` with the Review schema; runs only when Jev says the plan was not followed or is not confident.
- `src/lib/eval/evaluate.ts` - the cascade. `evaluate(input, { judge, review })` takes its two model calls as arguments so the verdict logic is tested without a network; `evaluateRun` binds the real ones. `unknown` is returned when a judge fails, never `fail`: a broken judge must not mark good work bad.
- `src/lib/eval/evaluate.eval.test.ts` - the evaluator over `fixtures/llm-cases.json` (EVAL=1), writing `docs/EVAL.md`. 9/10 at merge.
