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
