# Plan (size A, approved T+26)

## WP0 - main thread, T+26 to T+30

Everything the packages share lands first, because every worktree branches from the commit WP0 ends on.
Tests first: `src/contracts/*.test.ts` (each schema accepts a fixture and rejects a broken one, each stub answers in
shape), committed as `test: WP0 contracts`. Then: `@anthropic-ai/claude-agent-sdk` and `csv-parse` installed,
`next.config.ts` with `serverExternalPackages`, `runs/` gitignored, schema pushed (`db:push`), `scripts/seed.ts`
loading `fixtures/runs.json` and `fixtures/connections.json`, shadcn Switch added, one page rendering fixture data
through the stubs, `npm run check` green, pushed with the `scaffold` tag. No deploy: the first one is offered.

## Packages

### P1 - engine
- agent: P1; worktree/branch: created at spawn
- owns: src/lib/agent/**, src/lib/runs/**, src/app/api/runs/**
- contract: provides src/contracts/run.ts and src/contracts/agent.ts via src/lib/runs/queries.ts, state.ts, start.ts, src/lib/agent/run.ts, map-message.ts
- tests first (`test(P1): ...`):
    - src/lib/agent/map-message.test.ts: init -> started (model, tools, mcp_servers); assistant text -> text; assistant tool_use -> tool_call (mcp__x__y keeps its name); user tool_result -> tool_result with a 300-char preview and is_error; the plan tool's calls -> a plan event; result -> finished (subtype, cost, turns); system non-init -> nothing
    - src/lib/runs/state.test.ts: over fixtures/runs.json events: turn = tool calls, lastTool with viaConnection for mcp__ names, toolsUsed, connections {status from started, used from calls}, plan = last plan event, currentStep = the running one, files from Write calls, error from a failed finished
- then the code: plan-tool.ts (`createSdkMcpServer` with set_plan/update_step, each call appends a plan event), system.prompt.ts, run.ts (query() per agent-sdk.md: cwd runs/<id>, settingSources [], caps from AgentLimits, enabled connections as http mcpServers with Bearer headers, every message -> run_events; after result: copy .txt/.md/.csv from runs/<id> into files; status evaluating; evaluateRun(); store verdict; close), queries.ts on Drizzle, start.ts (insert + after()), api/runs/[id]/route.ts (run+events+files+state JSON), api/runs/[id]/files/[name]/route.ts (attachment)
- phase A -> R2, T+38: mapper and state tests green; one real run recorded locally (`npm run check` + a curl of the api route)
- phase B: the live loop end to end, connection status written back to connections.last_status
- done when: a run started from the page ends with events, files, a verdict and status succeeded on :3000

### P2 - ui
- agent: P2; port: 3001
- owns: src/app/page.tsx, src/app/actions.ts, src/app/loading.tsx, src/components/automations/**, e2e/flow.spec.ts
- contract: uses run.ts, agent.ts, connection.ts, eval.ts
- tests first (`test(P2): ...`):
    - e2e/flow.spec.ts: the page shows the instructions box, the connections with switches, the runs list; opening a fixture run shows its plan, state card, timeline, files and verdict
    - src/components/automations/format.test.ts: tool call one-liners (WebSearch "q", Write output.csv, mcp__deepwiki__read_wiki_structure -> "DeepWiki: read_wiki_structure"), duration and cost formatting
- then the code: instructions-form (useActionState, Zod errors, placeholder = the AI-news prompt, no presets), connections-list (Switch -> setConnectionEnabled action; add-connection form name/url/token), runs-list, run-panel (client; polls /api/runs/[id] every 2 s while running; intent/outputs/sources, plan with statuses, state card, timeline, files with Download, verdict with reasons and review, Run again, Re-evaluate)
- phase A -> R1, T+36: the page on stubs with a fixture run open in the panel; he looks at: the panel's order (intent, plan, state, timeline), the connections switches, the verdict block
- phase B: polling, the actions wired, empty/error states, the add-connection form
- done when: e2e/flow.spec.ts passes on :3001 against the stubs

### P3 - eval
- agent: P3
- owns: src/lib/eval/**, docs/EVAL.md
- contract: provides src/contracts/eval.ts via src/lib/eval/evaluate.ts
- tests first (`test(P3): ...`):
    - src/lib/eval/checks.test.ts: a CSV with header and rows passes; empty CSV fails "rows"; unterminated quote fails "parses"; duplicate rows fail "duplicates"; .md non-empty passes; a file asked for but missing fails "file_expected"; a .png is rejected
    - src/lib/eval/verdict.test.ts (decide/extract mocked): checks fail -> fail; both confident true -> pass; answeredQuery confident false -> fail; followedPlan false -> review called; review finished+suitable -> pass_with_notes; finished+not suitable -> fail with changeNeeded; judge throws -> unknown
    - src/lib/eval/evaluate.eval.test.ts over fixtures/llm-cases.json (EVAL=1), writes docs/EVAL.md; bar 8/10
- then the code: checks.ts, judge.ts (decide() with noul answeredQuery/followedPlan), review.ts + review.prompt.ts (extract() with Review), evaluate.ts (the cascade)
- phase A -> R2, T+38: unit tests green, the eval table in docs/EVAL.md
- phase B: prompt tuning on the failing cases
- done when: `npm run check` green and EVAL >= 8/10

### P4 - connections
- agent: P4
- owns: src/lib/connections/**
- contract: provides src/contracts/connection.ts via src/lib/connections/store.ts
- tests first (`test(P4): ...`): src/lib/connections/store.int.test.ts: add returns hasToken true and never the token; setEnabled flips; listEnabledWithSecrets returns the token; deletes what it creates. src/lib/connections/mcp-config.test.ts: connection -> `{ type, url, headers: { Authorization: Bearer } }`, key = slug of the name, no header without a token
- then the code: store.ts on Drizzle, mcp-config.ts (used by P1 through the contract's ConnectionSecret)
- phase A: tests green (reviewed at R3)
- done when: the switch on the page changes what the next run's started event lists

## Ownership
Main keeps src/contracts/, src/db/schema.ts, fixtures/, package.json, src/components/ui/, next.config.ts, scripts/seed.ts, CLAUDE.md, docs/ (bar docs/EVAL.md). A package that needs one of these stops and reports.

## Review points
| R | package | what | where | look at | ETA |
|---|---|---|---|---|---|
| R1 | P2 | the page on fixtures | http://localhost:3001 | panel order, switches, verdict block | T+36 |
| R2 | P3, P1 | eval table; one recorded real run | docs/EVAL.md, /api/runs/<id> | which cases fail and why; the plan events | T+38 |
| R3 | all | merged app | http://localhost:3000 | a live run end to end | T+44 |
| R4 | all | live URL | the Vercel URL | does a run spawn there | T+48 |

## Merge order
On arrival. Tie-break: P4, P3, P1, P2 (data, LLM, engine, UI). Seams: P1 calls P3's evaluateRun and P4's listEnabledConnectionsWithSecrets through the contracts.

## Checks at the end
`grep -rn "// STUB" src` empty before R3; e2e/flow.spec.ts on main; e2e/smoke.spec.ts against production; qa at R3 and R4.
