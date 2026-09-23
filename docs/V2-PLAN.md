# v2 plan

Status: being built locally on the `v2` branch against its own database (the QA project), not deployed, no tags
(his call, 2026-09-23). His changes to the first draft are under **Changes** below; the rest stands. Written 2026-09-22 from `docs/ROADMAP.md`, the improvement list sent with
the deliverable, the open QA items (Q48: no authentication; the `reevaluateRun` integration test) and the code as
it stands at v1.1.0. Where a choice needed a design, the design is sketched here; where a choice is his, it is
listed under **Decisions** at the end with the default the plan assumes.

## In one paragraph

v1 proved the loop: free text in, a plan the agent keeps updated, files out, connections enforced at the run, a
verdict before "done". v2 turns that loop into a product other people can use: **sign-in and workspaces**, a
**calmer three-page layout** (Home, Automations, Settings), an **automation builder** that turns a run into a
tested, approved automation invoked as `\audit Acme Ltd`, **a verdict that explains itself**, and **guardrails** for an
agent that reads the open web. The runtime stays the Claude Agent SDK, one subprocess per run, and the trace
stays one ordered stream of events from which everything on screen is derived. What is overhauled: tenancy (every
row belongs to a workspace), the information architecture, the engine's extension points (templates, guards,
per-step checks, cancel), and the verdict's shape. What is kept: the engine loop, `run_events` as the
single trace, `deriveState`, the evaluator cascade, and the glance view.

## What the user can do in v2

1. **Sign in** (email and password; Google when configured). A personal workspace is created; runs, connections
   and automations belong to it. Nobody else sees them.
2. **Home**: one box, "What should the agent do?". Free text as today, or `\audit Acme Ltd` to run a saved
   automation with an input. The chips under the box say which connections are on. Runs sit in a rail on the
   left, grouped by day, each with its outcome dot. The selected run is the main column: the glance view as in
   v1.1, plus **Why?** under the outcome, **Stop** while it runs, **Save as automation** when it is done, and
   **Details** as a drawer instead of an inline block.
3. **Automations**, built from a run (his flow): pick a finished run, press **Make an automation**; an LLM drafts
   the automation from it; the editor shows the draft (name, command, the input and its label, the instructions
   with `{input}`, the expected output and steps); the user tries it on one or two example inputs, sees each
   example's result with the automatic verdict, and judges each one (looks right / not right, with a note).
   **Approve** needs one approved example of the current version and no rejected one; an edit sends it back to
   draft. Once approved it is callable from the Home box as `\audit Apple Inc.` (or `/audit`), can run on a
   schedule, and has a history.
4. **Settings**: Connections (moved off Home; each server shows its tools and status, bearer or OAuth sign-in),
   Limits (budget per day, runs per day, runs in flight, today's usage, guard switches), Members.
5. **A verdict that explains itself**: the checks as a checklist, the judge's two answers in words, whether a
   reviewer was called and what it concluded, and a per-step "on track" mark on the stepper while the run goes.
6. **Guardrails**: a fetched page cannot talk the agent into reading outside the run or posting the task's text
   to a third party; files with credentials are quarantined; personal data is flagged; a workspace has a daily
   budget. Every guard decision is visible in the run's details.

## Screens

Home (desktop, about 1280 px). The composer is on top of the run column, so "write, run, watch" stays one motion;
the rail is the only other element on the page.

```
+--------------------------------------------------------------------------------------------+
| Automations          Home    Automations    Settings                          (A) Avshalom |
+------------------+-------------------------------------------------------------------------+
| Today            | [ What should the agent do?                                            ] |
| * AI news to CSV | [ \ runs a saved automation                                            ] |
| o Nvidia Q2 ...  |   Using: DeepWiki (on)  GitHub (off)                            [ Run ] |
| Yesterday        +-------------------------------------------------------------------------+
| * DeepWiki digest| Fetch the latest AI news from the web and save them into a CSV          |
| * Jev use cases  |                                                          Details >      |
|                  | Done - looks good.                                              Why?     |
| [search runs]    | (*)----(*)----(*)----( )   Search . Open stories . Write CSV . Report   |
|                  |                                                                         |
|                  | Produced   output.csv - 12 rows              [Download] [Save as automation]
|                  | Report     The agent searched ... (rendered markdown)                   |
+------------------+-------------------------------------------------------------------------+
```

The composer with a command typed. The popover lists the workspace's automations; Enter fills the command, the
rest of the line is the input.

```
[ \aud                                                                                      ]
  +-------------------------------------------------------------------+
  | \audit    Audit a company: web + Companies House -> audit.md      |
  | \news     Weekly AI news digest -> news.csv                       |
  +-------------------------------------------------------------------+
```

"Why?" opens under the outcome sentence, in plain words, one line per tier that ran:

```
Done, with notes.                                                                    Why? ^
  ok   7 checks passed: the CSV parses, 12 rows, no duplicates, every URL valid, dates within 7 days
  ?    The judge was sure the files answer your instructions (91%) but not that the plan was finished (62%)
  ok   A reviewer read the whole run: finished and usable. "Step 3 was skipped because the RSS feed ..."
```

Settings, Connections tab (Limits and Members are the same shape):

```
Settings     Connections | Limits | Members
  DeepWiki      mcp.deepwiki.com/mcp        connected . 3 tools        [on ]  Edit
  GitHub        read-only                   needs a token              [off]  Edit
  + Add a server
```

Automation builder (reached from **Make an automation** on a run, or **New from a run** on the Automations page):

```
Company audit                                   draft · version 2           [ Approve and save ]
  Name     [ Company audit      ]   Command \[ audit ]   Input [ Company name ] hint [ e.g. Apple Inc. ]
  Instructions  [ Audit {input}: ownership, filings, news of the last 90 days ...                   ]
  Produces      [ audit.md with sections Ownership, Filings, News, Risks                           ]
  Steps         1. Search the web for {input}   2. Read the filings   3. Write audit.md   + step
  Needs         Connections: [x] DeepWiki
  ------------------------------------------------------------------------------------------------
  Try it   [ Apple Inc.              ] [ Run example ]      examples of version 2
    Apple Inc.     Done - looks good     audit.md   [ Looks right ] [ Not right ]   approved
    Nvidia Corp.   Working on it ...
  Approve needs one approved example of this version and none marked not right.
```

Mobile (390 px): the rail is a sheet opened from the top bar, the composer stays on top, the run below it.
Details is a full-height sheet. The glance view's rules from v1.1 hold: nothing technical in the main column.

## Architecture

```
proxy.ts (session gate) -> (app)/layout.tsx: session, workspace, top bar, user menu
Home page ---------------- reads: runs/queries (by workspace), automations/store, connections/store
  composer (client) ------ actions.startRun(text) -> automations/command.parse -> runs/start -> runner.enqueue
  run column (server) ---- deriveState (unchanged) + verdict.path -> glance view, Why?, Details drawer (client, polls)
Automations page --------- automations/store, template editor (client form, useActionState)
Settings pages ----------- connections/store (+crypto, oauth), usage/budget, auth/members
runner/enqueue.ts -------- inline (after(), as v1) | queue (a jobs table the worker polls)      [part E]
agent/run.ts ------------- query(): system prompt + automation template addendum
                           mcpServers: plan (set_plan, update_step), outputs (make_chart, make_spreadsheet), the connections
                           hooks: PreToolUse guards (path, url, write, connection), PostToolUse step-check
                           every message -> run_events (kinds + guard, check); cancel polled every 2 s
eval/evaluate.ts --------- checks -> judge -> review, now recording decidedBy and path; output scan on files
db ----------------------- workspaces, users, sessions (auth), runs, run_events, files, connections,
                           automations, jobs [part E]
```

Model vs code, unchanged in spirit: the agent plans and works; Jev answers closed questions (the verdict, the
per-step check, the guard's "is this exfiltration?"); `extract()` writes structured drafts (the review, the
automation draft generalised from a run); the person approves or rejects an automation's examples; code does everything else and stores every model answer with its
input.

## Data model (additive to v1's tables; nothing renamed)

- `workspaces` (id, name, created_at); `users`, `sessions`, `accounts` as the auth library defines them;
  `memberships` (user_id, workspace_id, role owner|member).
- `runs` + `workspace_id`, `created_by`, `automation_id` (nullable), `input` (the text after the command),
  `cancel_requested_at`, `session_id` (the SDK session, for follow-up turns later). `status` gains `cancelled`.
- `run_events` unchanged; `kind` gains `guard` (a guard's decision) and `check` (a per-step judgment).
- `files` + `flags jsonb` (what the output scan found) and `quarantined boolean`.
- `connections` + `workspace_id`, `token_enc` (AES-256-GCM under `CONNECTION_KEY`; `token` dropped after a
  one-off re-encryption), `tools jsonb` (the tool names seen in the last init message).
- `automations` (id, workspace_id, name, command, description, input_label, input_hint, template jsonb, status
  draft|active|disabled, version, created_from_run_id, approved_at, schedule, schedule_input, next_run_at).
- `runs` also + `purpose` (adhoc|trial|automation|schedule|followup), `automation_version`, `human_verdict`,
  `human_note`, `reviewed_at`: an automation's examples are runs with purpose `trial`, judged by the person.
- `workspace_settings` (workspace_id, daily_budget_usd, daily_run_limit, max_in_flight, step_checks,
  strict_connections, denied_domains).
- Better Auth's `user`, `session`, `account`, `verification`, `organization` (= workspace), `member`, `invitation`.
- `jobs` [part E] (id, run_id, status, locked_by, locked_at, attempts).
- Usage is computed (sum of `runs.cost_usd` per workspace per day), not stored.

Tenancy rule: every query function takes the workspace id from the session, never from the client, through one
helper (`withWorkspace(ws)`), and the integration test that matters is "workspace B cannot read workspace A's run,
file, connection or automation". Postgres row-level security is the optional second belt.

## Contracts (the seams that change)

```ts
// src/contracts/automation.ts
export const AutomationTemplate = z.object({
  instructions: z.string().max(4000),      // the brief with {input} where the input goes
  intent: z.string(),
  expectedOutputs: z.array(z.string()).min(1),
  outputFormat: z.string().optional(),     // CSV columns, report headings: what "the same output" means
  steps: z.array(z.string().min(1)).min(1).max(12),
  connections: z.array(z.string()),        // connection names that must be on, or the run refuses to start
});
export const Command = z.object({ command: z.string().regex(/^[a-z][a-z0-9-]{1,23}$/), input: z.string().max(2000) });
export type ParseCommand = (text: string) => Command | null;       // "\audit Acme Ltd" and "/audit Acme Ltd"
export type DraftTemplate = (run: { prompt; plan; files }) => Promise<AutomationTemplate>; // extract(), user edits before save

// src/contracts/eval.ts, added to Verdict
decidedBy: z.enum(["checks", "judge", "review", "nobody"]),   // which tier produced the verdict
path: z.array(z.enum(["checks", "judge", "review"])),         // the tiers that ran, in order
export const StepCheck = z.object({ stepIndex: z.number().int(), onTrack: z.number().min(0).max(1), note: z.string() });

// src/contracts/run.ts, added to RunEvent
{ kind: "guard", payload: { tool: string, decision: "allowed" | "blocked" | "flagged" | "unchecked", reason: string } }
{ kind: "check", payload: StepCheck }

// src/contracts/runner.ts
export type EnqueueRun = (runId: string) => Promise<void>;   // inline: after(runAutomation); queue: a jobs row
export type CancelRun = (runId: string) => Promise<void>;    // sets cancel_requested_at; the runner aborts within 2 s
```

## The workstreams

### A. Sign-in, workspaces, settings shell (closes Q48)

- **Auth: Better Auth** with the Drizzle adapter, sessions in Postgres, email and password, Google when
  `GOOGLE_CLIENT_ID` is set (no mail provider is configured, so no magic link and invitations are links). Its organisations plugin is the workspace model (members, roles) when sharing comes. Alternatives:
  Clerk (fastest, hosted, priced per user) or Neon Auth (Better Auth managed by Neon, through the marketplace).
- `proxy.ts` gates every route but `/sign-in`, `/api/health` and the static files; Server Components read the
  session once in the layout; route handlers (polling, downloads) check the same cookie.
- Every table above gets `workspace_id`; every query goes through `withWorkspace`; the seed creates a demo
  workspace; the `reevaluateRun` integration test lands with the tenancy tests (the one open v1 item).
- Connection tokens encrypted at rest; a one-off script re-encrypts the existing rows.
- Settings pages: Connections (moved from Home, now with the tool list from the last init message and an Edit
  form), Limits (runs per day, cost per day, in flight; today's usage). Rate limits by address stay as the
  outer brake.
- Tests first: `withWorkspace` integration tests (cross-workspace reads return null),
  the crypto round trip, the budget arithmetic; e2e: sign-in, a run as user A invisible to user B.

### B. The new Home, cancel, and the verdict that explains itself

- Layout: top bar with three pages, the runs rail grouped by day (`groupByDay`, pure, tested), the composer on
  top of the run column, Details as a drawer (shadcn Sheet, added to `src/components/ui/`). The glance view's
  components move as they are.
- **Cancel**: a Stop button sets `cancel_requested_at`; the run loop checks it every two seconds beside its
  deadline and aborts; status `cancelled`, shown as "Stopped by you".
- **Why?**: `evaluate()` records `decidedBy` and `path`; the Why block renders one line per tier in plain words
  (the wording lives in `outcome.ts` beside the outcome sentence, tested on fixture verdicts). Re-evaluate stays
  in the Details drawer.
- The runs list API and the run API filter by workspace; the search box filters the rail client-side.

### C. The automation builder (his flow, replaces skills)

- **No user-editable skills in v2** (his call, 2026-09-23): prompt text a user writes must not reach the agent
  unless it has been tested on examples and approved by a person. Reusable behaviour lives only in automations.
- **Draft from a run**: **Make an automation** on a finished run (or **New from a run** on the Automations page, with
  a run picker) calls `draftAutomation()` (`extract()`, prompt in `src/lib/automations/draft.prompt.ts`) with the
  run's instructions, plan, report and files. It returns `AutomationDraft`: name, command, the input's label, hint
  and the value the run used, and the template (instructions with `{input}`, intent, expected outputs, output
  format, steps, required connections). The draft is stored as an automation with status `draft`.
- **The editor**: every field of the draft, with validation (`AutomationEdit`); saving an edit that changes the
  template bumps the version, so examples of an older version no longer count.
- **Examples**: the user types one or two inputs and presses **Run example**; each is a run with purpose `trial`,
  `automation_id` and `automation_version`, started through `startTrial()` with the template filled. The editor
  polls them and shows each one's outcome, the verdict's "Why?", its files and a link to the full run.
- **The person's judgment**: each finished example gets **Looks right** / **Not right** with an optional note
  (`human_verdict` on the run). `canApprove()` (pure, tested): at least one approved example of the current version
  and none rejected.
- **Approve and save**: status `active`, `approved_at`; the command must be unique among the workspace's
  automations. Disable and re-enable from the automation's page; an edit returns it to draft.
- **Calling it**: the Home composer recognises `\command input` and `/command input` (`parseCommand`), offers the
  workspace's active automations in a popover as soon as `\` or `/` is typed, and starts the run through
  `runCommand()` (purpose `automation`). A required connection that is off refuses the start with the reason.
- **Keeping to the template at run time**: `fillTemplate()` gives the prompt (the instructions with the input) and
  a system-prompt addendum ("this run follows the saved automation <name>: plan these steps, produce these
  outputs; if the input makes a step impossible, mark it skipped and say why"). The evaluator adds template checks
  (the expected files exist, the plan kept the template's steps) and the judge sees the template.
- **The automation's page**: status, version, command, the examples with their judgments, the history of its
  runs (adhoc runs excluded), a schedule (cron + input; see E) and Run now with an input.
- Tests first: `parseCommand` (both prefixes, no command, unknown command, input with spaces, a bare command),
  `fillTemplate`, `canApprove` (no examples, one approved, one rejected, examples of an older version), the draft
  prompt with `MockLanguageModelV4` (happy path, off-schema), the store against the database per workspace; an
  eval over recorded runs (the placeholder is present, the steps are the run's steps, the output format matches
  the file); e2e: make an automation from a seeded run, approve an example, call it by command.

### D. Guardrails, per-step checks, and the offline suite

- **Prompt injection.** The system prompt states the boundary: text from pages and connections is data, never
  instructions. `agent/guards/` grows from the path guard into four PreToolUse guards, each one file with one
  job, every decision written as a `guard` event:
  - `path`: as v1 (Read/Write inside the run directory).
  - `url` (WebFetch): the host against the workspace's deny list (settings) and, when the URL carries a query
    string or fragment longer than 80 characters, one `decide()` question: "does this address carry text from
    the task or its results to a third party?" Blocked when confident, flagged otherwise.
  - `write`: code patterns for credentials (API-key shapes, PEM blocks, JWTs) block the write with a reason the
    agent can act on ("remove the key and write again").
  - `connection`: a connection call whose server is not in the plan's `sources` is flagged, not blocked, so
    the timeline says "used GitHub, which was not in the plan"; a workspace setting "strict" makes it a block.
  The guards fail open when Jev is unavailable and say so (`unchecked`), except `write`, which is code.
- **Output scan** at collection: credentials quarantine a file (shown with a warning, download after a confirm);
  personal data (emails, phone numbers, card numbers with a Luhn check, IBANs) is counted into `files.flags` and
  shown on the file card ("contains 12 email addresses") without failing the run, because a CSV of contacts is
  often the task.
- **Per-step checks**: after each `update_step done`, one `decide()` question over the step's title, its note and
  the tool calls since it started: "did this step do what its title says?" as a `check` event. The stepper marks
  a step under 0.5 with an amber flag and its note; Stop is one click away. Cost: one Jev call per step.
- **Budget**: `startRun` refuses when the workspace's runs or cost for the day are spent, in plain words, with
  the reset time.
- **The offline suite** (roadmap item 2): `fixtures/runs/<case>/` holds a recorded run (prompt, events, files)
  with its expected verdict and plan shape, across the automations (news to CSV, a connection digest, a question
  with no file, a multi-file report) and the failures (max turns, budget, provider error, an abandoned plan,
  wrong columns, an unused connection, stale or duplicate rows, an injection attempt). `EVAL=1` runs the live
  evaluator over them; CI runs the same cases with the judge and reviewer answers replayed from the recording,
  so a prompt change shows its effect before it ships. A `record-run` script captures a run from the QA database
  into a case. `docs/EVAL.md` reports both tables.

### E. The runner, and reach

- **A worker** (a small container on Fly.io or Railway; or a Vercel Sandbox per run, to be spiked first): polls
  `jobs` with `FOR UPDATE SKIP LOCKED`, runs `runAutomation` unchanged, and the web app only enqueues and reads.
  It removes the 300 s function cap (runs of any length, more turns), holds the abort controller for cancel,
  allows stdio MCP servers and the SDK's own sandbox. `RUNNER=inline` keeps v1's `after()` path for development
  and as the fallback. Phases A to D do not need it; long automations and schedules do.
- **Follow-up turns**: "ask for a change" on a finished run resumes the SDK session (`resume: sessionId`) with a
  `SessionStore` backed by Postgres, so a run becomes a short thread; the reviewer's `changeNeeded` becomes a
  one-click follow-up. Needs the session persisted off the function's disk, hence this phase.
- **Schedules**: an automation with a cron (Vercel cron enqueues; the worker runs); a run started by a schedule
  says so in the rail.
- **Streaming**: a `/api/runs/[id]/events` SSE route (Node runtime, works on Vercel) replaces polling, and
  `includePartialMessages` gives token streaming of the report.
- **Connections with OAuth** (GitHub, Notion, Jira) and per-tool switches inside a connection; **more output
  kinds** (xlsx, png charts) through Vercel Blob once outputs are not small text.

## Phasing

Built locally as one v2 on the `v2` branch, no tags for now (his call, 2026-09-23). The phases below are the
order the parts depend on each other, not separate releases: A to D are built in parallel from one set of
contracts; E's worker, schedules, follow-ups and streaming are built beside them.

| part | what |
|---|---|
| A | sign-in, workspaces, encrypted tokens, Settings with Connections, Limits and Members |
| B | new Home: runs rail by day, composer with commands, Details drawer, Stop, "Why?", follow-up |
| C | the automation builder: draft from a run, editor, examples judged by a person, approve, `\command input` |
| D | guards (url, write, connection), output scan, per-step checks, budget, the offline suite |
| E | the queue and worker, schedules, follow-ups on the SDK session, streaming, OAuth connections, charts and spreadsheets |

## The live demo while v2 is built

The v1 URL is in the reviewer's hands. Sign-in would lock him out, so v2 deploys to a **new Vercel project and
URL** (its own database, the QA project's sibling) until the process ends; `duvo-take-home.vercel.app` stays at
v1.1.0. The v1 curated runs are re-seeded into the demo workspace of v2.

## Risks

- **Auth in front of the demo**: handled by the separate URL above.
- **A guard call on every tool call slows a run**: the Jev questions are asked only on suspicious inputs (long
  query strings, calls outside the plan), with a 3 s timeout that fails open and says so.
- **Template drafts are wrong**: the user edits before saving, and the six-case eval catches regressions.
- **A draft generalises badly**: the person edits it and must approve a real example before it can be called.
- **Tenancy leaks**: one helper, one integration test that tries the leak, row-level security as the second belt.
- **Sessions do not survive on Vercel** (follow-ups): a Postgres `SessionStore`, or the worker; phase 5 only.
- **Jev calls per step add cost**: about six per run at a fraction of a cent each; a workspace setting turns
  per-step checks off.

## Changes (his, 2026-09-23)

- Implement all of it locally; no tags for now.
- Skills dropped: untested user prompt text must not reach the agent. Automations only, built from a run, tested on
  one or two examples that the person judges, then approved (section C).

## Decisions (his; the plan assumes the default)

1. **Auth library**: Better Auth, email and password plus Google when configured (default) | Clerk | Neon Auth.
2. **Tenant**: workspaces with members from day one, one personal workspace per user (default) | per user only.
3. **Runner**: keep the in-function loop through phase 4, worker in phase 5 (default) | worker first.
4. **Skills**: dropped for v2 (his call): behaviour a user adds goes through a tested, approved automation.
5. **Command prefix**: `\` as written in the mail, `/` accepted too (default) | one of them.
6. **Connection calls outside the plan**: flagged (default) | blocked ("strict" as a setting).
7. **The live URL**: v2 on a new project and URL, v1 frozen for the reviewer (default) | replace in place.
8. **Order**: privacy before the new look (phase 1 then 2, default) | the look first.

## Build (local, 2026-09-23)

The foundation is one commit on `v2`: the schema (Better Auth's tables, the v2 columns and tables), every contract
above in `src/contracts/`, a `// STUB` at each seam wired into its caller, the pages moved into `(app)` (Home,
Automations, Settings) and `(auth)`, and a demo workspace seeded (`demo@example.com` / `demo-password`, local
only). Locally the app runs on the QA database (`node .claude/scripts/v2-env.mjs`, undone with `--restore`), so
production is never written to.

Packages are who builds which files in parallel, not runtime components. Each one fills the stubs in the files it
owns, tests first, and is merged when it reports:

| package | owns | fills |
|---|---|---|
| auth | `src/lib/auth/**`, `src/proxy.ts`, `src/app/(auth)/**`, `src/app/api/auth/**`, `src/components/auth/**`, `src/lib/runs/queries.ts`, `playwright.config.ts`, `e2e/auth*`, `e2e/tenancy*` | sessions, sign-in, personal workspace on sign-up, switcher, invitations, tenancy tests |
| home | `src/app/(app)/page.tsx`, `loading.tsx`, `actions.ts`, `readable*`, `src/components/run/**`, `src/components/shell/**`, `src/lib/runs/state*`, `e2e/flow.spec.ts`, `e2e/home*` | the new Home, Why?, Stop, Details drawer, follow-up box, commands in the composer |
| engine | `src/lib/agent/**` (not `guards/`, `guard*`, `system.prompt.ts`), `src/lib/runner/**`, `src/lib/runs/{start,cancel,follow-up,limits,rate-limit}*`, `src/app/api/runs/route.ts`, `src/app/api/runs/[id]/route.ts`, `src/app/api/runs/[id]/events/**`, `src/app/api/cron/**`, `scripts/worker.ts` | cancel, queue and worker, schedules, follow-ups, SSE |
| guards | `src/lib/agent/guards/**`, `src/lib/agent/guard*`, `src/lib/agent/system.prompt.ts` | url, write and connection guards, output scan, the data boundary in the prompt |
| outputs | `src/lib/outputs/**`, `src/app/api/runs/[id]/files/**`, `src/lib/runs/download-headers*` | charts (.svg), spreadsheets (.xlsx), quarantine on download |
| eval | `src/lib/eval/**`, `fixtures/runs/**`, `scripts/record-run.ts`, `docs/EVAL.md` | Why? fields, per-step check, template checks, the offline suite |
| automations | `src/app/(app)/automations/**`, `src/lib/automations/**`, `src/components/automations/**`, `e2e/automations*` | the builder, examples, approval, commands, the automation's page |
| settings | `src/app/(app)/settings/**`, `src/components/settings/**`, `src/lib/connections/store*`, `src/lib/connections/crypto*`, `src/lib/usage/**`, `scripts/encrypt-tokens.ts`, `e2e/settings*` | connections (edit, tools, encryption), limits and budget, members page |
| oauth | `src/lib/connections/oauth/**`, `src/app/api/connections/oauth/**` | MCP OAuth: discovery, client registration, PKCE, refresh |

Main keeps `src/contracts/`, `src/db/`, `fixtures/` (bar `fixtures/runs/`), `package.json`, `src/components/ui/`,
`src/app/layout.tsx`, `CLAUDE.md` and `docs/` (bar `docs/EVAL.md`); a package that needs one of them asks.
