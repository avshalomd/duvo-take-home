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

## P1 - engine

- `src/lib/agent/run.ts` - the run loop: `query()` from the Agent SDK with `cwd: runs/<id>`, `settingSources: []` (isolation: no user or repo settings leak into the agent), permissions bypassed but Bash/Edit/Task removed, caps from `AgentLimits`, the enabled connections as http `mcpServers` keyed by `connectionKey()`. Every message becomes a `run_events` row; after the result the .txt/.md/.csv files are copied into `files`, `evaluateRun` runs, and the run is closed with the verdict.
- `src/lib/agent/plan-tool.ts` - an in-process MCP server (`createSdkMcpServer`) with `set_plan` and `update_step`. The agent must say where it is; the loop records each call as a `plan` event holding the whole plan, so the state at any point is the last plan event.
- `src/lib/agent/system.prompt.ts` - a generic automation agent: plan first, no questions, text files only, end with a report. No task-specific prompt and no presets.
- `src/lib/agent/map-message.ts` - `createMapper()` is one mapper per run (it tracks that run's plan and the ids of its plan-tool calls); SDK messages in, zero or more RunEvents out; system messages other than init are dropped.
- `src/lib/runs/state.ts` - `deriveState(run, events)`, pure: turn = tool calls, last tool with its connection, tools used, connections with `used` from the calls, plan from the last plan event, files from Write calls.
- `src/lib/runs/start.ts` - inserts the run and schedules `runAutomation` in `after()`, so the action returns at once and the loop outlives the response (`maxDuration` 300 on the routes).
- `src/app/api/runs/[id]/route.ts`, `files/[name]/route.ts` - the panel's poll (run, events, files, verdict, state) and the download with `Content-Disposition: attachment`.
- `src/lib/eval/reevaluate.ts` (P3, phase B) - `reevaluate(runId, { load, evaluate, save })`: the two Drizzle queries are injected, so the mapping `toEvaluateInput` (last plan event = the plan, deduped tool_call names = toolsUsed, the run's own day as today) is tested without Postgres. `connection_used` became a code check: a connection named in the instructions must appear as `mcp__<key>__*` in the tools used.

## P2 - ui

- `src/app/page.tsx` - one Server Component reads runs, connections and the selected run (`?run=<id>`), derives its state, and renders the left column and the panel. No client fetch on first paint.
- `src/app/actions.ts` - the Server Actions: `startRun` (Zod, then `redirect` outside the try because redirect throws its own signal), `toggleConnection`, `addConnection`, `reevaluate`. Every action returns its state, so a failure is an alert on the page, never a crash.
- `src/components/automations/run-panel.tsx`, `use-run-poll.ts`, `poll.ts` - the panel polls `/api/runs/[id]` every 2 s only while the run can still change, validates the payload with Zod and keeps the server render when the payload is off, so a bad response degrades to "no live update", not a broken page.
- `src/components/automations/format.ts` - tool calls as one-liners; `mcp__deepwiki__read_wiki_structure` reads "DeepWiki: read_wiki_structure" by matching the connection key.
- `src/components/automations/connections-list.tsx` - the switches and the folded add-a-server form; a token is typed once and never rendered back.
- `e2e/flow.spec.ts` - the page and the panel on seeded runs, run on :3000 before a deploy.

## Round 2 - fixes and the glance view

- `src/lib/agent/run.ts` - the wall clock is enforced with an AbortController at `AgentLimits.wallClockMs`; a PreToolUse hook refuses any Read/Write path outside the run's directory (both spellings of the temp dir on macOS); the whole tail (files, evaluation, closing) sits inside the try, so a run always ends in a terminal status with its reason; on Vercel the run directory is under the OS temp dir.
- `src/lib/agent/plan-tool.ts` - `createPlanServer()` per run: an MCP server instance can connect to one transport only, so a shared one broke the second concurrent run.
- `src/lib/agent/map-message.ts` - error results keep the provider's own words (`errors[]`); every event is stamped with the assistant turn so the state's turn matches the SDK's cap; the host's ToolSearch call is not the agent's work and is dropped.
- `src/lib/eval/checks.ts` - a row without a URL is not a duplicate.
- `src/lib/llm/decide.ts` - honours `AI_SIMULATE_DOWN` like `getModel()`, so QA can walk "judge unavailable".
- `src/components/automations/run-panel.tsx`, `plan-stepper.tsx`, `details-section.tsx` (UX, C6) - the glance view for office workers: the instruction as the title, the outcome in a sentence, the plan as an animated stepper with a progress bar; everything technical (timeline, state grid, judgment, ids, model) under a Details toggle. Pure display rules live in `console.ts`-style helpers with their own tests.
- `src/components/automations/` (UX, round 2) - `run-panel.tsx` no longer clips or floats its header (Q38); `overview.tsx`-style blocks say what the run produced (file cards, the report rendered from `markdown.ts`) and how it turned out in plain words; `status-words.ts` gives the runs list and the panel one vocabulary (Done, Done with notes, Something went wrong, Working...); the Details toggle holds the timeline, the state grid, the judgment sentence, the raw error and the ids. `Run.outcome` (the verdict's headline) exists so the list can agree with the panel without loading every verdict.

## Round 4 - after the deep QA (docs/QA.md, Q46-Q79)

- `src/lib/runs/limits.ts`, `rate-limit.ts`, `client-ip.ts` - the cap on runs in flight (3) and the per-address bucket (5 per 10 min) live inside `startRun`, so the form and the POST route cannot drift; the cap is checked before the bucket so a refused visitor keeps their tokens. Per server instance: real protection is authentication (roadmap).
- `src/lib/runs/download-headers.ts` - the download name goes out as an ascii fallback plus RFC 5987 `filename*`, with `X-Content-Type-Options: nosniff`; the route no longer double-decodes the segment.
- `src/lib/agent/workspace.ts`, `unknown-verdict.ts` - the run directory is removed in the finally; an evaluator crash stores an `unknown` verdict with its reason instead of null.
- `src/lib/eval/checks.ts` - strict field counts (a ragged row fails `parses` by row number), a `urls` check on the url column, skip counts in the details, and `connectionRequired()` that reads the sentence naming a connection to tell a route from an offer.
- `src/contracts/connection.ts` - `publicHttpUrl`: http(s) only, no loopback, link-local or private hosts, because the SDK child fetches the URL server-side.
- `.claude/scripts/qa-env.mjs`, `npm run qa:dev` - the app against the separate QA database, so QA never writes to production again.

## v2 (local, `v2` branch)

### Foundation
- `src/db/auth-schema.ts` - Better Auth's tables, generated; its `organization` is our workspace, so tenancy is one
  `workspace_id` column on our own tables and one filter in every query.
- `src/contracts/automation.ts` - the automation builder's seams: `AutomationDraft` (the LLM's output), `AutomationEdit`
  (the form), `Trial` (an example with the evaluator's outcome and the person's judgment), `canApprove`.
- `src/lib/agent/run.ts` - one serialized writer for events: the agent's messages, guard decisions and step checks
  come from different callbacks and each gets its seq when written, so the trace stays one ordered stream.

### oauth
- `src/lib/connections/oauth/complete.ts` - the pending state is cleared before the code is exchanged: a state works once.
- `src/app/api/connections/oauth/redirect.ts` - a cookie ties a sign-in to the browser that started it, so a link
  someone else sends cannot attach their account to your connection.
- `src/lib/connections/oauth/headers.ts` - a refused refresh marks the connection as needing sign-in; a server that
  is down keeps the tokens; a refresh another run already did is reused.

### outputs
- `src/lib/outputs/tools/make-chart.ts` - the agent draws nothing: it passes data, our code renders the SVG. The tool
  advertises a catchall object instead of the contract's `z.record`, which the SDK cannot turn into JSON Schema
  (the tools silently vanished in the first live run).
- `src/lib/outputs/file-response.ts` - a quarantined file answers 409 until `?confirm=1`; only an SVG is served
  inline, with a no-script content policy.
- `src/lib/outputs/chart-render.ts` - vega is loaded on first use: its top-level await broke every `tsx` script.

### guards
- `src/lib/agent/guards/index.ts` - one PreToolUse hook per tool; its guards run in a fixed order and the first block
  wins. Only decisions that are not "allowed" are recorded, so the timeline stays quiet.
- `src/lib/agent/guards/url.ts` - code decides first (private hosts, denied domains); Jev is asked only when a query
  string is long enough to carry data out (CSV rows in a query scored 0.94, a long search 0.17). Jev down or slow
  lets the fetch through, recorded as "unchecked": a guard must not stop honest work.
- `src/lib/agent/guards/scan.ts` - credentials quarantine a file; personal data (emails, phones, Luhn-checked cards,
  mod-97-checked IBANs) is only counted, because a contact list is often the task.
- `src/contracts/connection.ts` `isPrivateHost` - one rule for "private or local" shared by the connection form and
  the url guard, so they cannot drift; `plan` and `outputs` are reserved connection names.

### auth
- `src/lib/auth/workspaces.ts` `createPersonalWorkspace` - one `db.batch` writes the workspace and its owner and points
  the sign-up session at them: Better Auth runs the user "after" hook once the session already exists.
- `src/lib/auth/paths.ts` `needsSignIn` - the proxy leaves `/api/*` to the routes: a 401 JSON is something a fetch or
  a poll can read, a redirect would hand it the sign-in page's HTML.
- `src/lib/auth/actions.ts` `openWorkspaceHome` - switching, creating or accepting a workspace revalidates the layout
  before opening Home, or the top bar keeps naming the old workspace.
- `src/app/(auth)/invite/[id]` - explains the invitation before asking anyone to sign in, pre-fills the email, and
  refuses a different signed-in account with "Sign in as ...".
