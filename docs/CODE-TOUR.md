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
- `src/lib/eval/suite.eval.test.ts` - the evaluator over `fixtures/llm-cases.json` (EVAL=1), writing `docs/EVAL.md`. 9/10 at merge.

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
  lets the fetch through, recorded as "unchecked": a guard must not stop honest work. `carried.ts` also runs the
  output scan's personal-data detectors over the decoded path and query (security review S2): `/leak/jane@corp.com`
  is short, yet it is exactly what must not leave, so it is asked about too.
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
- `src/lib/auth/organization-writes.ts` - Better Auth's organization writes (create, rename, invite, role, remove,
  leave, delete) are refused over HTTP by a tiny plugin: the app makes them only through its actions with
  `auth.api`, where its own rules sit (the member-change lock, name limits, one pending invitation). A request
  carries `ctx.request`; an `auth.api` call does not, which is how the two are told apart. Deleting a workspace is
  off altogether (`disableOrganizationDeletion`), and `dueAutomations` joins `organization`, so a schedule whose
  workspace is gone never fires.

### engine
- `src/lib/agent/close.ts` `updateUnlessCancelled` - every exit of the run loop writes through it, so a Stop that
  lands during evaluation is never overwritten by "succeeded".
- `src/lib/agent/run.ts` - a run is claimed with one `queued -> running` update (a second worker or a retried
  after() does nothing); the user's MCP servers are spread first and ours last, so no connection can replace them.
- `src/lib/runner/jobs.ts`, `recover.ts` - jobs claimed with `FOR UPDATE SKIP LOCKED` inside a real transaction; a
  stale job is requeued while attempts < 2 (its run starts over clean), otherwise its run fails with the reason.
  `closeAbandonedRuns` fails a run left unfinished for 30 minutes with no job (an inline server that restarted).
- `src/lib/runner/enqueue.ts`, `src/app/api/runner/[id]/route.ts` - RUNNER=route (Vercel): `enqueueRun` posts the
  run to `/api/runner/<id>` on the app's public address, and that route answers 202 and runs the loop in after().
  It is the only route `next.config.ts` gives the agent's binary (~240 MB); with the binary in every route, each
  route was a function of its own and the Hobby plan's 12-function cap refused the deploy. If the runner cannot
  be reached, `fail-start.ts` closes the run as failed so it never waits forever.
- `src/lib/runner/token.ts` - the runner's token is an HMAC of the run id under the sign-in secret, with its own
  label: no new secret to set, and a token seen once starts no other run (the run's own claim stops a replay).
  `src/app/api/cron/tick/route.ts` compares `CRON_SECRET` the same way, in constant time (S12), and without a secret
  answers a plain 404 that names no setting (F23).
- `src/lib/runs/without-machine-paths.ts` - `GET /api/runs/<id>` takes the machine's folder off every path in its
  answer, as the page does (F20), and drops the started event's own `cwd`.
- `src/lib/agent/session.ts` - a follow-up resumes the parent's SDK session with `forkSession` when it still exists
  (checked with `getSessionInfo`), and always carries a preamble of what the parent did, because on Vercel /tmp is
  per instance and the session is gone.
- `src/app/api/runs/[id]/events/route.ts` - Server-Sent Events from the database once a second; ends itself after
  280 s (under the function limit) and the client reconnects with `?after=<seq>`.

### eval
- `src/lib/eval/evaluate.ts` - every verdict records `decidedBy` and `path`, which is what "Why?" shows.
- `src/lib/eval/run-rows.ts` `forEvaluator` - a file the output scan held back for a credential reaches the judges
  (third-party services) as `(held back: contains a credential)`, never its content, live and on Check again (S8).
- `src/lib/eval/template-checks.ts` - a run of a saved automation is also checked against its template: a plan step
  keeps a template step when it holds 40% of its words (filler and `{input}` dropped), a skip with a note counts as
  kept, and the promised files must exist.
- `src/lib/eval/step-check.ts` - one `decide()` yes/no per finished step; the note is written by code, not by Jev.
- `src/lib/eval/suite.test.ts`, `suite.eval.test.ts`, `fixtures/runs/` - the offline test of the evaluator (not a
  product feature): 18 recorded runs, replayed with recorded judge answers in `npm run check`, live with `EVAL=1`
  (`docs/EVAL.md`). The live run caught an injected advert passing at 0.80; the judge and review prompts now say that
  what a run read is data, and it fails.

### settings
- `src/lib/connections/crypto.ts` - AES-256-GCM in a versioned envelope ("v1:"); a missing key and a damaged value
  give different errors, so a misconfigured server is not mistaken for tampering.
- `src/lib/connections/store.ts` - tokens are written only into `token_enc`; `scripts/encrypt-tokens.ts` moved the v1
  plain tokens; only a token-type server keeps a token when edited.
- `src/lib/usage/budget-rule.ts` - the day's limits are checked before runs in progress, so the reason given is the
  one that will still be true in a minute.

### home
- `src/components/run/why.ts` - "Why?" in plain words, one line per tier that ran, no percentages (those are in
  Details); a v1 verdict without `path` still gets a sensible answer.
- `src/components/run/use-run-poll.ts` - the event stream first, resumed with `?after=<seq>` when it ends at 280 s;
  a stream that never delivers falls back to polling every 2 s.
- `src/lib/automations/command.ts` `parseCommand` - text starting with `/` and a character that is not a space is
  always a command, whatever the word (his call, F14): `/über test`, `/2024-report x` and `/audit, Apple` had become
  paid free-text runs. `runCommand` refuses a name no automation can have ("There's no /über command.") before any
  lookup, and an unknown valid one in its own words, on Home and on `POST /api/runs` (400) alike.
  `command-query.ts` only drives the list under the box, which opens for names an automation can have.

### automations
- `src/lib/automations/template.ts` `changesThePrompt` - which edits need a new approved example: the template, the
  name and the input label (they go into the system prompt); not the hint, the example value or the command.
- `src/lib/automations/store.ts` - approval is written only if the version is still the one whose examples were
  checked, so an edit saved in between cannot slip through.
- `src/lib/automations/from-run.ts` - the connections an automation needs are read by code from the run's actual
  tool calls, not guessed by the model.
- `src/components/automations/drafting.tsx` - the draft is a Server Action started once the page is on screen, so a
  prefetch or a crawler fetching the URL never spends a model call.

### The v2 look ("the thread", docs/DESIGN-V2.md)
- `src/app/globals.css` - the palette as named tokens (mist, paper, graphite, slate, saffron, fern, crimson) mapped
  onto shadcn's names, so every primitive picked the look up at once; `glass` goes through Tailwind's backdrop
  utilities because a hand-written `backdrop-filter` compiled to the -webkit- form only and never blurred in Chrome.
- `src/components/thread/thread.tsx` - one animated plan line for the run, the automation examples and sign-in. The
  fill is a spring on `scaleY` measured from the nodes; steps already done at first paint never pop, so the server's
  markup and a reduced-motion browser agree; the running bead breathes in CSS so reduced motion switches it off.
- `src/lib/automations/schedule.ts`, `src/lib/runner/next-run.ts` - a schedule is a cron in its own IANA zone
  (`schedule_tz`), so 08:00 stays 08:00 across daylight saving; a zone-less row (saved before) reads as UTC.
- `src/components/run/no-backslash-commands.test.ts` - commands are `/audit` only (his call); the test scans the
  Home's source for any text that would show a backslash command.

### After the deep QA of v2 (docs/QA.md, Q159-Q208)
- `src/lib/agent/heal.ts` `runBudgetMs` - inline or in the runner route a run lives in one 300 s function call, so
  the agent gets 300 - 50 (the evaluation, boxed) - 10 (step checks still out) - 10 (files and closing writes) = 230 s:
  a run the function outlived stayed "evaluating" for ever (Q159).
- `src/lib/agent/deadline.ts` `within()` - races the evaluation and the step checks against a timer; the model call
  is not stopped (it cannot be), only no longer waited for, and the run is "not checked", never a pass.
- `src/lib/runner/recover.ts` `sweepIfOverdue` - a run in flight past 6 minutes (inline, route) has no function left;
  the events stream, the polling route and Stop close it while someone watches, instead of at the next start.
- `src/lib/agent/stopped-cost.ts` `runTotals` - one sum of what a run's attempts cost, used by Stop and by every
  failure path, so the day's budget counts a run cut off by the wall clock too (Q161).
- `src/lib/runs/run-again.ts` - Run again sends only the run's id; the brief is read from the caller's workspace with
  `instructionsOf`, so a follow-up runs its whole thread, never just "Make the bars horizontal" (Q162).
- `src/lib/net/address.ts` - internal addresses by what they are (node:net's `isIP` and a `BlockList`, the IPv4
  inside mapped, NAT64 and 6to4 addresses) and a name by every address it resolves to; used on save, on each OAuth
  fetch and redirect, in the WebFetch guard and at run start (`src/lib/agent/connection-reach.ts`) (Q168).
- `src/lib/auth/invitation-privacy.ts` - Better Auth's organization plugin hands invitation ids to any member; the id
  is the proof of holding the link, so these hooks keep it for owners and admins (Q167).
- `src/lib/auth/invitation-cookie.ts`, `src/proxy.ts` - in invite mode an account needs the invitation's link, not
  just its email: the invitation page's visit leaves the id in an httpOnly cookie on `/api/auth`, which reaches the
  email sign-up and Google's callback alike, and `assertMayCreateAccount` checks it belongs to that email. An
  invitation to a personal workspace opens no account (S11, his call): every account owns one, so it let any account
  mint accounts or take an address first. Nothing marks a personal workspace but its slug, whose suffix is the start
  of its own id (`isPersonalWorkspace`, workspace-name.ts); the invitation and sign-up pages say so in words.
- `src/lib/runs/limits.ts` - a deployment-wide cap of six runs in flight under a second advisory lock, beside each
  workspace's own limits: every account can make workspaces, and they all spend one key (Q175).
- `src/lib/usage/deployment-budget.ts` - and a deployment-wide cap on a day's money (S1, his call): today's finished
  runs of every workspace plus each run in flight at its most ($1), read under that same global lock, against
  `DEPLOYMENT_DAILY_BUDGET_USD` (default $50; a value that is not an amount keeps the default). A file of its own,
  apart from the workspace's budget. `src/lib/auth/workspace-limit.ts` - a person owns at most five workspaces, the
  personal one included: asked in the action for the words, and held for every caller by `organizationLimit`.
- `next.config.ts` headers - no framing (`X-Frame-Options`, `frame-ancestors 'none'`), `nosniff`, a referrer policy
  and no `X-Powered-By` on every route (Q173). The content policy also says `object-src 'none'; base-uri 'none';
  script-src 'self' 'unsafe-inline'` (S13): static, so pages stay cacheable; inline because Next's hydration data is
  inline script. It is left off `/api/runs/<id>/files/*` by a negative lookahead in its `source`: a config header
  replaces a route's header of the same name, which had stripped the inline chart's sandbox policy (F8);
  `e2e/headers.spec.ts` checks both on real responses.
- `src/db/unique-violation.ts` - a check before a write cannot see a write racing it, so the unique index decides and
  the store answers its refusal (Postgres 23505, looked for through Drizzle's wrapped cause) in its own words: a
  connection's name key per workspace (`connections_ws_key`, an expression index on the key `connectionKey` makes,
  F6) and an automation's command (`automations_ws_command`, F7).
- `src/contracts/text.ts` `noNul` - one Zod rule for a NUL character, which Postgres refuses in text and which had
  surfaced as an empty 500 (F1); the run, follow-up, automation, judgment, connection and workspace schemas use it,
  and Better Auth's names are checked in its hooks (`src/lib/auth/names.ts`).

### Roles and limits (his decisions after the deep QA: Q169, Q176-Q178)
- `src/lib/auth/member-rules.ts` - who may change whose role or remove whom, as plain functions the page and the
  actions both ask: an admin never acts on an owner or makes one, the last owner stays, nobody changes themselves
  here. The actions then call Better Auth's own `removeMember` / `updateMemberRole`, so its rules apply as well.
- `src/lib/automations/permissions.ts` - approving, switching, deleting, scheduling and renaming a Ready command are
  for owners and admins; drafting, editing, examples and judging are for everyone. Approval is the human gate that
  lets written instructions reach the agent, so whoever approves answers for the workspace.
- `runs.human_verdict_by` and `src/lib/runs/verdict-words.ts` - a judgment records who made it (from the session),
  so "You said it looks right" is only ever said to that person; older rows read "Marked: looks right".
- `src/lib/auth/auth.ts` rate limit - counted in the `rate_limit` table, not in one function instance's memory, and
  on in every environment: 3 sign-in or sign-up tries per 10 s per client address and path.
- `src/app/api/health/cache.ts` - the deep check's model answer is kept 60 s per instance, so the open health route
  cannot be used to make paid calls; the database is asked every time.
- `src/lib/auth/members.ts` - role changes and removals run one at a time per workspace, under an advisory lock
  inside a transaction, with the owners re-counted under it: two owners demoting each other at once left none (Q211).
  Removing or demoting an admin closes the invitations they sent, in the same step (Q213). `createInvite` runs under
  a lock of its own per workspace, so three invitations to one address sent at once leave one pending, and
  `member_org_user_uidx` (auth-schema.ts, ours) keeps a person in a workspace once (F5).
- `src/lib/automations/permissions.ts` `hasBeenApproved` - the command of an automation approved once stays an owner's
  or an admin's to change, even after an edit sends it back to draft; the save's SQL repeats the check (Q212, Q225).
- `src/lib/auth/session.ts` - in a Server Action (Next's `next-action` header) a workspace the user has left is not
  swapped for their own: writes that name no record are refused in words instead of landing elsewhere (Q226).

### Frontend review (2026-09-24)
- `src/components/automations/automation-save.tsx` - the document's save state sits above the automation page's two
  layouts: a save that sends a Ready automation back to draft draws the document elsewhere in the tree, and state
  kept inside it (the "version 2 now" message) was lost. Cancel drops a refused save's values, so Edit opens clean.
- `src/components/automations/example-files.tsx` - a held-back file on an example card is not a download (the route
  answers 409 until confirmed); the card says so and the full run offers "Download anyway".
- `src/app/(app)/automations/actions.ts` `parseRunInput` - an example's and a Run's input get the command's 2000
  character limit in the action (Zod) and again in `startTrial`.
- `src/app/(app)/error.tsx`, `src/app/global-error.tsx` - a failed page, action or transition behind sign-in shows a
  calm Try again under the top bar; the root layout has its own net. Neither shows the error's text.
- `src/components/automations/follow-draft.ts` - leaving the drafting page stops following the draft, so nobody is
  pulled onto it half a minute later; one draft per attempt still survives React's double effect in development.
- `src/lib/runs/queries.ts` `getRunSince` - the event stream reads the run and only its new events each second, and
  checks the session again every 15 reads, ending the stream for someone removed from the workspace or signed out.
- `src/components/run/poll.ts` `reconnectDelay`, `pollGivesUp` - a broken stream is reopened after 1, 2, then 5 s;
  polling stops on 401/403/404 and the page refreshes once to say why.
- `src/components/thread/thread.tsx` `planShape`, `nextTrack` - the thread re-measures when its plan's keys and
  statuses change, not on every new array a live run hands it, and an unchanged measure causes no render.
- `src/components/settings/connection-row.tsx` - the switch is `useOptimistic` over the server's value, so it follows
  a change made elsewhere after a refresh and falls back by itself when a press is refused.
- `src/components/focus-ring.test.ts` - a row that tints on keyboard focus must also draw the app's focus ring.

### The engine review (2026-09-24) and the owner's calls on it
- `src/lib/eval/evaluate.ts` `REVIEW_SHARE_MS` - inside the run's 50 s box the judge gets the box less 20 s, spread
  over its routes (`judge.ts`), and the reviewer the rest, one clock over every try (`extract()`'s `signal`), with no
  fallback once it is spent. Re-evaluate and the suite set no box and keep 20 s per route and 45 s per try.
- `src/lib/eval/clip.ts` - what the judge and the reviewer read is bounded: ten files and a report cut to its start and
  end for Jev (built again smaller when `stateTooLong()` says so); long lines cut and 60,000 characters of files, the
  rest named, for the reviewer.
- `src/lib/llm/decide.ts` `answerShape` - each answer is checked against its question (a number in [0, 1], a listed
  option, a position on the scale); a malformed one is `off-schema` and the next route is asked, never a NaN.
- `src/lib/eval/checks.ts` `connection_used` - the name in the instructions goes through `connectionKey()`, and a tool
  counts when its server key is that key or starts with it as whole words ("GitHub" is `github_read_only`).
- `src/lib/eval/judge.ts` `couldBeInstructedFromOutside` - a follow-up counts as having read outside text: it resumes
  its parent's conversation, pages included.
- `src/lib/agent/event-writer.ts` - the run's one ordered writer; an insert is tried twice and a failure goes to its
  own caller only, so one database blink no longer fails every later write. The connection badge update is fired and
  logged outside it.
- `src/lib/agent/map-message.ts` - a turn is one model response: the SDK sends an assistant message per content block,
  all with one `message.id`.
- `src/lib/agent/run.ts` and Stop (the owner's call on qa-func F24) - Stop ends work still in progress, nothing after:
  once an attempt has sent its result, an abort while the child shuts down is ignored, the check is not raced against
  Stop, and a Stop by then closes the run with that answer and verdict instead of starting a fix attempt.
- `src/lib/runner/worker-loop.ts`, `jobs.ts` - the worker moves `locked_at` every minute for its jobs in flight, so only
  a dead worker's job is recovered, and `finishJob` matches `locked_by`, so a late finish never closes another's job.
- `src/lib/usage/budget-rule.ts` - the day's limit is never passed (the owner's call): a start needs room for its own
  $1 (`AgentLimits.maxBudgetUsd`) and $1 for each run in flight, and a fix attempt the same.
- `src/lib/ai.ts` `getFallbackModel` - beside Anthropic (every environment that runs agents) the second model is on
  OpenRouter whenever its key is set (the owner's call), so one provider's outage is not the reviewer's.
- `src/lib/runner/next-run.ts` `LATE_SLOT_MS`, `src/lib/automations/store.ts` `nextRunFromNow` - a slot over an hour
  late is skipped, not run at the wrong hour; turning an automation on or approving it counts its next run from now.
- `automations.last_skipped_at` / `last_skipped_reason`, `src/lib/runner/skip-reason.ts` - a slot that started no run
  (a limit refused it, or it was late) is kept with its reason in plain words and shown beside the schedule; the next
  scheduled start clears it.

### UX QA round (2026-09-24, U1-U19)
- `src/components/run/run-sheet.tsx` `STEPS_ASIDE`, `actions-row.tsx` `data-asking` - while Ask for a change is open
  the floating composer sinks and fades (CSS `:has()` on the sheet, no state passed between them) and turns invisible,
  so there is one box and Send is never under the capsule; `follow-up-form.tsx` scrolls itself into view and has Cancel
  and Escape.
- `src/components/run/pending-sheet.tsx`, `composer.tsx` `ComposerStandIn` - the sheet shown at the press of Run is the
  live page's skeleton (inert Stop and Details, the plan, What it made, the composer's capsule from the same constants),
  so the real page replaces it with only words changing; `e2e/flow.spec.ts` measures both at 1280 and 390.
- `src/components/run/relative-time.ts` - past today a run's time counts calendar days in the reader's zone with the
  rail's own `dayKey`/`dayLabel`, so the header and the rail agree; `fullDate` is the tooltip, built from parts in a
  fixed order. `time-ago.tsx` reads the reader's clock through `useSyncExternalStore` (UTC on the server).
- `src/components/run/markdown.ts` - a paragraph keeps its single line breaks as `br` spans, each line parsed on its own.
- `src/app/layout.tsx`, `settings/layout.tsx` title templates, `src/app/(app)/tab-title.ts` - every page names itself
  in the tab; Home and an automation read their record through React `cache`, once for the title and once for the page.
- `src/components/settings/role-words.ts` - one set of words for the roles, in the role menu and the invite's helper.
- `src/lib/automations/form.ts` `changesWhatTheAgentIsTold` - the editor asks the save's own rule (`changesThePrompt`)
  of the form on every change, to tell an approver beside Save that saving takes the command out of use.
- `src/components/thread/thread.tsx` `planOnly` - a plan nobody has run (the gallery) reads its steps with no state.

### The AI-quality review (2026-09-24, qa-ai F1-F12) and the owner's calls on it
- `src/lib/eval/file-view.ts` `forModel` - the judge and the reviewer read a chart by the labels vega writes on its marks,
  title and axes ("quarter: Q2; Sales: 95500"), and a spreadsheet by the sheets the spreadsheet tool was given: the SVG
  is one 11 KB line whose first 300 characters said nothing, and a wrong bar passed on the report's word (F1).
- `src/lib/eval/from-events.ts` - what the evaluator reads from the events besides the files: each spreadsheet's sheets
  (the last `make_spreadsheet` call per file) and the start of every outside result the run read, so the live run and
  Re-evaluate read them the same way.
- `src/lib/eval/judge.ts` - Jev answers three more questions in the same request, free: `factsAgree` (the numbers and
  facts agree with the instructions and what the run read, F2), `handling` (a choice: did the work, truthfully cannot be
  done here, needs the person's answer, F3) and, for a run with no file, `statesFacts`. `stayedInBounds` is also asked
  when the instructions carry pasted text (`carriesPastedText`, F10). Steps left `unmarked` make the plan question "was
  the work done end to end" (F8).
- `src/lib/eval/evaluate.ts` - a sure refusal is its own verdict (`cannot_do`, `needs_answer`), neutral and never healed;
  a missing file as the only failed check asks the judge first, since a refusal writes none. A plain answer resting on
  facts always gets the reviewer, and its pass is a plain pass. A sure "does not answer" goes to the reviewer (F4).
  `FACTS_BAR` 0.5: clean runs came back 0.65-0.77 on `factsAgree` (Jev sees only the start of what a run read), the
  wrong chart 0.03, so only a lean to no is a doubt.
- `src/lib/eval/feedback.ts` `isHealable` - a heal needs a failed check or the reviewer's named change: two heals on the
  judge's "check the result against the instructions" changed only the report's words (F4).
- `src/lib/eval/review.prompt.ts` - the reviewer recomputes totals from data the instructions give, holds numbers to what
  the run read, treats a made-up source as unusable, and calls a truthful refusal finished and suitable (F11, F3).
- `src/contracts/eval.ts` `VerdictKind` - the one list of headlines every reader parses the jsonb verdict with; the two
  new ones needed no schema change.
- `src/lib/agent/plan-state.ts` `untickedMarked` - when the agent ends well, code marks the steps it never ticked
  `unmarked` ("not marked" on the thread, a faint hollow node); the agent's own `update_step` cannot set it (F8).
- `src/lib/agent/system.prompt.ts`, `heal.ts`, `follow-up-prompt.ts` - the final message is the whole report and stands
  alone (F9); a refusal says truthfully why, and a brief with nothing to work on gets one question instead of a guess
  (F3); the heal and follow-up prompts give the agent no phrase to echo into the report (F5). A reply to "Needs your
  answer" is sent to the agent as the answer, not as a change.
- `src/lib/eval/check-words.ts` - a failed check said as what went wrong ("countries.csv could not be read as a table
  (row 5 has 6 values, the header has 3)"), in Why?, Ask for a change and Details; stored reasons are read back through
  the check's label (qa-ux U10).
- `src/components/run/outcome.ts` - one style, "Done, ..." (U6); an unknown or missing verdict is "Done, not checked" with
  a hollow ring everywhere and Check again beside it (U7); "Could not be done" (slate) and "Needs your answer" (a dashed
  ink ring, like a draft that waits for a person) with a hint. Why? says "an automatic check" and "a closer check",
  never judge or reviewer (U23).
- `src/lib/automations/template.ts` `canApprove` - an example that could not be done or asked a question does not count
  toward approval, whoever marked it right.
- `fixtures/runs/` - four cases from the probes: `chart-wrong-value`, `invented-holidays` (both altered by hand from real
  runs), `refusal-cannot-do`, `ambiguous-needs-answer`. `AgentLimits.maxTurns` is 40 (F12); the $1 budget is unchanged.

### The owner's last four calls (2026-09-24: U3, frontend review 5, security S7, F18/S10)

- `src/components/run/home-data.ts` `composerProps` and `src/lib/usage/budget-rule.ts` `startRefusal` - Home reads the
  workspace's limits and today's usage as Settings > Limits does, and hands the composer the start refusal the server
  would give, if any. `src/components/run/composer.tsx` refuses Run in the box with that reason: no stand-in sheet, no
  request. Only a start that would otherwise hand over (a title): a mistyped command or a short brief still gets its own
  reason first. The server stays the authority: a refusal it alone knows (the deployment's caps, the address brake)
  still arrives late, on today's path (U3).
- `src/components/run/use-refresh-when-a-run-settles.ts` - while the refusal is one a run settling may lift, one GET of
  `/api/runs` every five seconds; once fewer runs are working than the page was drawn with, `router.refresh()` reads the
  limits again. The baseline is the server's own count, so a run that settles before the first look is not missed.
- `src/components/run/details-panel.tsx` - below 640 px Details is Base UI's modal Dialog, full screen: focus stays in
  it, the run under it is inert, and Escape or Close hand the keyboard back to the Details button (`finalFocus`). It
  slides in from the right and leaves the same way on the iOS sheet curve, a CSS transition so a close mid-entry
  reverses; reduced motion cross-fades. The desk keeps the parallel panel with no scrim (frontend review 5).
- `src/lib/connections/for-viewer.ts` - a plain member's Connections page is sent only each server's origin (no path,
  query or user and password), flagged `addressHidden`; the row shows the host and says who sees the whole address. The
  server form says an address with a key in it is as secret as a password (security review S7).
- `src/lib/usage/model-spend.ts` `payForModelCall` and the `model_spend` table - Check again and Make an automation are
  paid model calls outside a run. Under a per-workspace advisory lock the day's money is checked (`spend-rule.ts`), then
  the limit (one re-check a minute per run, three drafts per workspace in 10 minutes), and the press is recorded; the
  work then runs metered and its row gets the cost. The row is both the limit's count and part of the day's spend:
  `getUsage`, `healBudgetStop` and `deploymentSpentToday` add `spend-today.ts`'s sum (F18, S10).
- `src/lib/usage/meter.ts` - an AsyncLocalStorage meter: `extract()` and `decide()` report each call's tokens, and the
  meter around the work adds them up, so the evaluator's layers did not need a cost parameter each. Outside metered work
  (a live run's own checks) a report does nothing. `model-prices.ts` prices tokens: Sonnet 5 at its list price, Jev at
  a stated guess, and any other model at Sonnet 4.6's price, so the day never reads low.

### The owner's calls on the last recommendations (2026-09-24: qa-ai F6, F13, F14; qa-ux U22, U31; security S5)

- `src/lib/outputs/chart-spec.ts` `labels`, `y_title` - "show the numbers on the bars" is a common office ask the chart
  tool could not meet (F6). With `labels: true` the mark and a text layer share the encodings; the series colour stays
  on the mark's layer, so every value is written in the text colour. Each label is computed here (95,500; 84.7M once
  the values reach the millions, as the axis shortens them), and the value scale's `domainMax` is stretched by what
  a label needs, so the tallest bar's value never reaches the title. A pie gets none: its legend names the slices, and
  the tool's answer says so, so the agent does not claim them. `y_title` carries the unit ("Sales (euros)").
- `src/lib/outputs/chart-theme.ts` `VALUE_LABELS` - vega names the label layer's group `value_labels_marks`: the style
  block colours it like the axis labels in both schemes, and `eval/file-view.ts` tells the judge whether the chart
  writes its values. The layer is `aria: false`, because the bars already carry each value for a screen reader and
  the evaluator, and would read twice.
- `src/lib/agent/plan-state.ts` `applyPlanCall(..., fixAttempt)`, `describe_fix` - a fix attempt keeps the plan, and a
  step already done keeps its title and note: the re-marked step "Explain that the request is too ambiguous" sat over a
  note about the list the fix made (F14). The fix is a step of its own: the agent names it with `describe_fix` ("Put the
  unit in the axis title"), stored as `plan.fixes` by attempt, and `thread-steps.ts` draws it in place of "Fix what the
  check found (attempt n of m)". The mapper cannot tell attempts apart, so `run.ts` tells it (`map.startFix`) when it
  writes the heal event.
- `src/components/run/thread-steps.ts` `showsStepDoubts` - a doubt about one step is on the glance view only when the run
  did not pass (failed, stopped, not checked, a fail); on a pass, a pass with notes and the neutral outcomes it is in
  Details, and never while the run works (U22). `src/lib/eval/step-check.ts` asks Jev, in the same request, which of a
  fixed list went wrong ("nothing" among them), and code words it: "May not have done what it says: what it tried failed
  or found nothing to use."
- `src/lib/agent/system.prompt.ts`, `src/lib/eval/review.prompt.ts` - the plain-words rule (Q183) covers step titles too,
  and security jargon: no "data-exfiltration", "endpoint", "query parameter" or "proxies", but "sending your data to
  another website" (U31).
- `src/lib/runs/test-tag.ts` `withoutTestTag` - QA's leading "[e2e]" tag steered the agent ("e2e" read as the subject,
  F13). It is taken off what the agent, the step checks and the evaluator read (the run, a follow-up, Check again), and
  kept on the stored run: `instructionsOf` returns it as stored, because Run again saves what it returns and the
  clean-up looks for the tag there.
- **Known, accepted risk (security review S5, the owner's call):** a connection's address is checked when it is saved
  and again at run start (`src/lib/agent/connection-reach.ts`), but the agent's MCP client then connects on its own,
  inside the SDK's child process. A redirect from the server, or a name whose answer changes between the check and the
  connect, can still take it to an internal address after the checks: a blind request from the runner function, since
  the MCP transport does not go through `publicFetch` the way the OAuth fetches do (each hop checked, Q83). Not proven
  (it would need a paid run against a redirecting server) and accepted for now; the plain case, an address that leads
  inside, is closed by the two checks. The fix, when connections become common: route connection traffic
  through an in-process MCP proxy that makes every request with `publicFetch` (`src/lib/connections/oauth/fetch.ts`),
  redirects followed by hand and each hop checked, so the child only ever talks to the proxy.
