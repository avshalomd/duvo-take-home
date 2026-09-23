# Design

## What the user can do

1. Types free-text instructions (no presets: the example prompt is only the placeholder), sees which connections
   are on, clicks **Run**.
   The system inserts the run, redirects to `/?run=<id>` and starts the agent in `after()`.
2. The side panel opens on the run: the agent first states how it read the instructions through the plan tool -
   **intent, expected outputs, sources** (which connections and abilities) - and its steps; then the panel fills in
   step by step: the plan with done / current / pending, the key state card, the timeline of text, tool calls and results.
   The panel polls `/api/runs/[id]` every 2 s while the run is running.
3. The agent finishes with a **report** (what it did, what it could not do) and the files it wrote (.txt, .md,
   .csv). Files show with a Download button.
4. The **evaluator** runs before the run is marked done: code checks on the files, then Jev answers "answered the
   query?" and "followed the plan?". When Jev finds the plan was not followed, or is not confident, it escalates to
   an LLM review that decides whether the task is finished and whether the response is suitable or what must
   change. The verdict lands on the run: pass, pass with notes, fail, with reasons and the review when there was one.
5. Past runs are listed on the left; clicking one opens it in the panel. Connections can be switched on and off,
   and a new http MCP server added by name, URL and token.

One route, `/`. Search param `run` selects the panel's run, so a refresh keeps it.
States: no runs yet ("Run the preset to see the agent work"); run queued (panel shows "starting the agent"); running
(live); agent failed (`result.subtype` in red: max turns, budget, provider error, with **Run again**); evaluator
unavailable (verdict "unknown: judge unavailable", **Re-evaluate**); a file that is not text is not served.

```
+-------------------------------------------+-----------------------------------------------+
| Automations                               | Run 9a2f - running - turn 4 of 25              |
|                                           | PLAN  [x] Search the web for AI news (7 days)  |
| [Fetch the latest AI news from the web    |       [>] Open the top stories, collect fields |
|  and save them into a CSV. ...          ] |       [ ] Write output.csv                     |
|                                 [ Run ]   |       [ ] Report                               |
|                                           | STATE last tool: WebFetch theverge.com/...     |
| Connections                               |       tools: WebSearch x3, WebFetch x2         |
|  (o) DeepWiki   mcp.deepwiki.com   on     |       connections: DeepWiki connected, unused  |
|  ( ) GitHub     read-only  needs token    |       files: - | cost $0.08 | 31 s              |
|  + add an MCP server                      | TIMELINE                                       |
|                                           |  10:41:03 plan  set 4 steps                    |
| Runs                                      |  10:41:05 WebSearch "AI news September 2026"   |
|  > 9a2f running   AI news to CSV   now    |  10:41:09  -> 10 results: anthropic.com ...    |
|    7c11 passed    DeepWiki repo digest    |  10:41:12 text "Opening the three newest..."   |
|    3e08 failed    max turns               | FILES  (none yet)   VERDICT (after finish)     |
+-------------------------------------------+-----------------------------------------------+
```

## Module map

```
page.tsx (server) ──reads──> runs/queries.ts, connections/store.ts, runs/state.ts (deriveState, pure)
   |  instructions-form, connections-list, runs-list (client where they submit)
   |  run-panel.tsx (client, polls) ──GET──> api/runs/[id]/route.ts ──> queries + deriveState
   |                                        api/runs/[id]/files/[name]/route.ts ──> getFile (download)
actions.ts (server actions, Zod) ──> runs/start.ts (insert, after()) ──> agent/run.ts
                                 ──> connections/store.ts (toggle, add)
agent/run.ts: query() [Agent SDK subprocess] + agent/plan-tool.ts (sdk MCP: set_plan, update_step)
              + connections as mcpServers ──messages──> agent/map-message.ts ──> run_events rows
              then: copy .txt/.md/.csv from runs/<id> ──> files rows; eval/evaluate.ts ──> runs.verdict; close
eval/evaluate.ts: eval/checks.ts (code) -> llm/decide.ts (Jev: answeredQuery, followedPlan)
                  -> eval/review.ts (extract(), only when Jev says not followed or is unsure)
db: runs, run_events, files, connections
```

Model vs code: the agent (model) plans, searches, reads, writes the files and the report; Jev judges the two
closed questions. Code records every message, derives the state, enforces the connection switch, caps turns,
budget and time, checks the files, computes the verdict from checks and probabilities, and stores everything.

## Interfaces

`src/contracts/eval.ts` - the seam between the judge and the code that closes a run:

```ts
export const Judgment = z.object({ answeredQuery: z.number().min(0).max(1), followedPlan: z.number().min(0).max(1) });
export const Verdict = z.object({
  verdict: z.enum(["pass", "pass_with_notes", "fail", "unknown"]),
  checks: z.array(Check), judgment: Judgment.nullable(), reasons: z.array(z.string()), evaluatedAt: z.string(),
});
export type EvaluateRun = (input: { prompt; runStatus; report; plan; files: { name; content }[]; today }) => Promise<Verdict>;
```

`src/contracts/run.ts`: `RunEvent` (discriminated union on `kind`: started, text, tool_call, tool_result, plan,
finished; loose payloads), `Plan`/`PlanStep` (index, title, status pending|running|done|skipped, note), `Run`,
`RunState` (status, turn/maxTurns, plan, currentStep, lastTool + viaConnection, toolsUsed, connections
{name, status, used}, files, cost, duration, error), `DeriveState`, `ListRuns`, `GetRun`, `GetFile`.
`src/contracts/agent.ts`: `StartRun`, `RunAutomation`, `MapMessage`, `SetPlanInput`/`UpdateStepInput` (raw Zod
shapes for the SDK's `tool()`), `AgentLimits` (25 turns, $1, 240 s, .txt/.md/.csv).
`src/contracts/connection.ts`: `Connection` (hasToken, never the token), `NewConnection` (name, url, transport,
token), `ListConnections`, `SetConnectionEnabled`, `AddConnection`, `ListEnabledConnectionsWithSecrets`.

## Tables

- `runs` - one automation. `status text` queued|running|evaluating|succeeded|failed; `connection_ids jsonb` frozen
  at start (what the agent was given); `report text`; `verdict jsonb` (the whole Verdict, defensible later);
  `num_turns`, `duration_ms`, `cost_usd`; `error`; `finished_at`.
- `run_events` - the trace, `(run_id, seq)` indexed; `kind text`, `payload jsonb` validated with RunEvent on read.
  The plan lives here as `plan` events: the last one is the current plan, so state is derivable at any seq.
- `files` - `run_id`, `name`, `mime`, `bytes`, `content text` (small text files; no blob store for a CSV).
- `connections` - `name`, `url`, `transport`, `token` (stored as entered, never rendered), `enabled`, `last_status`.

## Model design

- **The agent**: Agent SDK `query()` (his decision; `.claude/docs/agent-sdk.md`), `cwd: runs/<id>`,
  `settingSources: []`, tools WebSearch, WebFetch, Read, Write plus `mcp__plan__*` and `mcp__<connection>__*`
  for every enabled connection; Bash, Edit, Task disallowed. Prompt in `src/lib/agent/system.prompt.ts`: call
  `set_plan` before anything else, `update_step` when a step starts and when it ends, write only .txt/.md/.csv
  into the working directory, end with a report of what was done and what could not be. Caps: 25 turns, $1,
  240 s wall clock; the `finished` event's subtype names which one ended a runaway run. Every message is stored
  as an event with the prompt that produced it; the UI shows a failed run in red with Run again.
- **The plan tool** input is the interpretation: `intent`, `expectedOutputs`, `sources` (which connections and
  abilities), `steps`. The agent gets no presets and no task-specific prompt: it reads the instructions itself.
- **The judge**: `decide()` (Jev), state = {instructions, plan with statuses, report, files with the first 40
  lines}, questions `answeredQuery` and `followedPlan` as `noul()`. Code checks first in `eval/checks.ts`: a file
  exists when the instructions ask for one, the extension is allowed, a CSV parses with a header and 1+ rows,
  no duplicate rows, .md/.txt non-empty. Verdict: any failed check -> fail; both answers confident true -> pass;
  answeredQuery confident false -> fail; **followedPlan false or unconfident -> tier two**: `extract()` with `Review`
  (`src/lib/eval/review.prompt.ts`, the instructions, plan, report and files in; taskFinished, responseSuitable,
  changeNeeded out): finished and suitable -> pass_with_notes, finished but not suitable -> fail with
  changeNeeded, not finished -> fail; judge unavailable -> unknown with the checks
  listed and a Re-evaluate button. Eval `src/lib/eval/suite.eval.test.ts` over `fixtures/llm-cases.json`
  (skipped unless `EVAL=1`), writing `docs/EVAL.md`; pass bar 8 of 10 verdicts as expected.

## Look

(Revised in round 2, his call C6: the glance view is for everyday office workers - the plan's progress as an animated stepper, the files and the outcome in plain words; everything technical under a Details view.) Originally: dense and quiet: zinc neutrals, one accent (emerald) for Run and pass, red only for failures; shadcn Card, Badge,
Button, Textarea, Input, Separator, Skeleton, Switch (added in WP0); monospace for tool inputs.

## Risks

- The SDK does not spawn on Vercel: the first deploy tries one run; if it fails, live runs are local-only, the
  seeded runs demo every screen, the README says so.
- The agent skips the plan tool: the system prompt requires it, the state card falls back to the tool calls, and
  the judge's followedPlan flags it.
- Jev's routes are down: verdict "unknown" with the code checks shown; Re-evaluate retries.

## Size

- **A, the Must core**: packages `engine` (agent run, plan tool, mapper, state, api routes), `ui` (page, form, panel,
  timeline, runs list), `eval` (checks + judge + eval test), `connections` (table, seed, toggle, add form) - all
  merged ~T+36 - leaves ~14 min for UI/UX rounds and his changes.
- **B, plus the Shoulds**: A + a per-turn evaluator (Jev after every agent turn, shown in the timeline) + token
  streaming of the assistant text - all merged ~T+43 - leaves ~7 min, no room for a mid-build change.
