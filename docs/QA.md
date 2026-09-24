# QA

## R3 - the merged app on :3000 (T+45 to T+48, orchestrator's walk)

| # | severity | finding | owner | status |
|---|---|---|---|---|
| 1 | - | Live run from the form: succeeded in 1 min 29 s, $0.39; plan of 4 steps with the agent's notes, state card, timeline, output.csv downloadable (attachment header), verdict pass with 7 checks and Jev 0.90 / 0.93 | - | verified |
| 2 | minor | The seeded "running" fixture run never finished, so its panel polled for ever | data | fixed at T+58: the seeded row was deleted from the database |
| 3 | minor | `reevaluateRun`'s two database queries have no integration test | eval | fixed in v2 (src/lib/eval/reevaluate.int.test.ts) |

No open blocker.

## R4 - the live URL

The midway deploy (T+44) passed the smoke test (health, home page). The last deploy carries the merged page; a live
run there needs `ANTHROPIC_API_KEY` on Vercel, which was not set during the hour.

## Round 2 (after the hour): bug log

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q1 | him | a run on the live URL stayed "queued" with no events | it runs, or fails with its reason | blocker | main | fixed (f706368: run dir under the temp dir on Vercel, early failures close the run) |
| Q2 | him | a run on the live URL failed: "Native CLI binary for linux-x64 not found" | the agent spawns on Vercel | blocker | main | fixed (670ebfc: the linux-x64 package traced into the functions; a run on the URL succeeded in 18 s with a file and a verdict) |
| Q3 | reviewer | `AgentLimits.wallClockMs` is never passed to `query()`; a slow agent runs until Vercel kills the function and the row stays running | an AbortController at 240 s closes the run as failed "timed out" | major | engine | fixed (tests + two real local runs by the fix agent) |
| Q4 | reviewer | one module-level plan MCP server is shared by every run; a second concurrent run gets no plan tool ("Already connected") | a plan server per run | major | engine | fixed (tests + two real local runs by the fix agent) |
| Q5 | reviewer | bypassPermissions with unrestricted Read/Write: a fetched page can make the agent read files outside the run dir and write them into an output | Read/Write refused outside the run's directory (PreToolUse hook), tools allowlist | major | engine | fixed (tests + two real local runs by the fix agent) |
| Q6 | reviewer | the file collection, evaluation and final update sit outside the try; a DB error leaves the run running/evaluating; a stream without a result is marked succeeded | the whole tail is in the try; no finished event = failed | major | engine | fixed (tests + two real local runs by the fix agent) |
| Q7 | reviewer | the SDK's error result carries `errors[]`, not `result`; the provider's message is lost and the run shows only the subtype code | the errors are joined into the report/error | major | engine | fixed (tests + two real local runs by the fix agent) |
| Q8 | reviewer | after Re-evaluate the panel keeps the polled terminal view; the new verdict never appears until reload | the poll state resets when the server render changes | major | ui | fixed (qa-func on the URL: the verdict swapped in after Re-evaluate without a reload) |
| Q9 | reviewer | the duplicate check counts blank URLs, so one row without a URL fails the whole verdict | blank URLs are ignored or keyed on content | minor | eval | fixed (tests + two real local runs by the fix agent) |
| Q10 | reviewer | reevaluate/setConnectionEnabled actions pass ids unvalidated; Re-evaluate on a running run writes a mid-run verdict | z.uuid()/z.boolean() in the actions; re-evaluate only a terminal run | minor | ui | fixed (z.uuid()/z.boolean() in the actions; qa-func: junk ids answer 404) |
| Q11 | qa-ux | at 390 px the page lays out at 729 px; the Run button is off-screen | fits 390 px (`min-w-0` on the grid children, `overflow-x-auto` on mono blocks) | major | ui | fixed (qa-ux re-walk: scrollWidth 390) |
| Q12 | qa-ux | the run panel is titled by its raw UUID | the instruction's first line as the title, the id small | minor | ui | fixed |
| Q13 | qa-ux | a failed run shows the SDK's raw error text | one plain sentence, the technical text folded | minor | ui | fixed (UX, merged 22efdf4) |
| Q14 | qa-ux | the final report is printed three times (text event, finished line, REPORT) | the finished line is one line: status, duration, cost | minor | ui | fixed (UX, merged 22efdf4) |
| Q15 | qa-ux | the report shows raw markdown | rendered or stripped markdown | minor | ui | fixed (UX, merged 22efdf4) |
| Q16 | qa-ux | raw `mcp__deepwiki__read_wiki_structure` in Tools used and in a verdict check | the toolLabel helper used everywhere | minor | ui | fixed (UX, merged 22efdf4) |
| Q17 | qa-ux | "Connections: deepwiki connected, unused" reads as contradictory | "DeepWiki - connected, not used by this run" | minor | ui | fixed (UX, merged 22efdf4) |
| Q18 | qa-ux | the raw enum `not_configured` on the GitHub row while its switch is on | "needs a token" and a warning that it does nothing until then | minor | ui | fixed (UX, merged 22efdf4) |
| Q19 | qa-ux | plan steps as `[x] [.] [ ]` in mono; `[x]` reads as failed | check / dot / empty circle icons | minor | ui | fixed (UX, merged 22efdf4) |
| Q20 | qa-ux | timeline clock times in UTC with no label | local time or a UTC label | minor | ui | fixed (UX, merged 22efdf4) |
| Q21 | qa-ux | runs list rows have no date or relative time | "12 min ago" beside the duration | minor | ui | fixed (UX: "18 min ago" on every row) |
| Q22 | qa-ux | cost and duration merged in one row, no tabular figures | two rows, tabular-nums | minor | ui | fixed (UX, merged 22efdf4) |
| Q23 | qa-ux | the judgment percentages are unexplained | "checked by a second model: 90% confident it answered the query" | minor | ui | fixed (UX, merged 22efdf4) |
| Q24 | qa-ux | add-a-server errors are fragments, not tied to inputs, focus lost | full sentences, aria-describedby, focus on the first error | minor | ui | fixed (UX: sentence errors, focus on the refused field) |
| Q25 | qa-ux | "No run selected" ignores the runs list beside it; "not found" offers no way back | "Pick a run on the left, or write instructions and press Run." | minor | ui | fixed (UX, merged 22efdf4) |
| Q26 | qa-ux | the product is called "App" in the header and the tab | a real name | minor | main | fixed |
| Q27 | qa-ux | the amber "running" badge is at 4.6:1 contrast at 10 px | amber-800 at that size | minor | ui | fixed |
| Q28 | qa-ux | a failed run at turn 0 shows "turn 0 of 25" and an enabled Re-evaluate | the counter hidden at turn 0, Re-evaluate disabled with nothing to judge | minor | ui | fixed (UX, merged 22efdf4) |
| Q29 | qa-func | the agent's init tool list includes host tools (CronCreate, SendMessage, Workflow, ToolSearch...) beyond the four native ones | only WebSearch, WebFetch, Read, Write, mcp__plan__*, mcp__<connection>__* | major | engine | fixed (SDK `tools` option; init lists only Read, WebFetch, WebSearch, Write, mcp__plan__*) |
| Q30 | qa-func | three runs from before the Vercel fix stay "queued" for ever in the list | terminal status with a reason | major | main | fixed (rows closed as failed with the reason) |
| Q31 | qa-func | AI_SIMULATE_DOWN does not reach decide(), so "judge unavailable" is unreachable in QA | the switch fails the judge too | minor | main | fixed |
| Q32 | qa-func | the SDK's own ToolSearch call precedes the plan and is counted in Tools used | ToolSearch hidden from tools used and the timeline | minor | engine | fixed (tests + two real local runs by the fix agent) |
| Q33 | qa-func | the state's turn counter (tool calls) disagrees with the SDK's num_turns | the turn shown is the one the cap applies to | minor | engine | fixed (a finished run shows the SDK num_turns; qa-func had found 8 vs 6) |
| Q34 | qa-func | the review's reasoning is rendered twice in the verdict | once | minor | ui | fixed (UX, merged 22efdf4) |
| Q35 | qa-func | Run again and Re-evaluate active while the run is running | disabled until terminal | minor | ui | fixed |
| Q36 | qa-func | an empty or 5-character instruction is refused with no visible message | a rendered field error | minor | ui | fixed |
| Q37 | qa-func | a terminal run without a plan says "has not said how it read the instructions yet" | "the agent never stated a plan" on a finished run | minor | ui | fixed (UX, merged 22efdf4) |
| Q38 | qa-ux | the panel header is `sticky top-14` inside an `overflow-hidden` wrapper: it covers the 56 px beneath it at every scroll position (the progress bar; on a failed run the whole explanation) | the block under the header fully visible (drop overflow-hidden or the sticky) | major | ui | fixed (UX, merged 22efdf4) |
| Q39 | qa-ux | the report prints raw markdown in the overview | rendered with markdown.ts | minor | ui | fixed (UX, merged 22efdf4) |
| Q40 | qa-ux | runs list says "succeeded/failed" while the panel says "Done - looks good / Something went wrong" | one vocabulary | minor | ui | fixed (UX, merged 22efdf4) |
| Q41 | qa-ux | connections rows show "needs-auth" and hosts in mono | "needs a token before a run can use it" | minor | ui | fixed (UX, merged 22efdf4) |
| Q42 | qa-ux | Details > State shows raw mcp__ tool names | toolLabel | minor | ui | fixed (UX, merged 22efdf4) |
| Q43 | qa-ux | Details > Verdict says "Not evaluated - the evaluator runs when the agent finishes" on a finished run | "This run was not judged." | minor | ui | fixed (UX, merged 22efdf4) |
| Q44 | qa-ux | add-a-server errors are fragments; focus stays on body after a failed submit | full sentences, focus the first bad field | minor | ui | fixed (UX, merged 22efdf4) |
| Q45 | qa-func | `/api/runs/<36 dashes>` returned 500: the id guard accepted any 36 hex-or-dash characters | a strict uuid shape, 404 otherwise | minor | engine | fixed |

## The QA database (from round 4 on)

Production is in the reviewer's hands, so QA never writes to it again. A separate Neon project `duvo-qa` (free
plan, fra1) is connected to the Vercel project's development environment only, under the `QA_` prefix.
`vercel env pull .env.qa --environment=development` fetches its URL (the file is ignored);
`node .claude/scripts/qa-env.mjs <cmd>` runs any command with `DATABASE_URL` swapped for it: `npm run qa:dev`
(the app on :3010 against the QA database), `npm run qa:seed`, `npm run qa:sql -- "<statement>"`.

## Round 3 (deep QA on the live URL): bug log

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q46 | qa-edge | `NewConnection.url` accepts any scheme and host (`javascript:`, `file:`, `http://localhost:3000`, `http://169.254.169.254/...`); the SDK child fetches it server-side | only http(s), no loopback/link-local/private hosts, readable error | major | main (contracts) | fixed (publicHttpUrl in the contract) |
| Q47 | qa-edge | no rate limit on run creation: 10 runs in 10 min from one client, each up to $1 | a per-IP/per-window cap on starting runs | major | engine | fixed (3 in flight cap + 5 per 10 min per address, inside startRun; verified with curl on the QA db) |
| Q48 | qa-edge | no authentication: any visitor reads every run, report and file and starts runs | known for a single-user demo; on the roadmap (1e) | minor | main | fixed in v2 (sign-in, workspaces, invite-only sign-up) |
| Q49 | qa-edge | on the injection prompt the agent called no tool at all, so the run closed with no plan (the judge failed it) | the plan tool is called before the agent decides anything, even to refuse | minor | engine | fixed (set_plan first even on a refusal) |
| Q50 | qa-edge | the markdown link regex stops at the first `)`: `[x](javascript:alert(1))` leaves a stray `)` | the whole link consumed (React already neutralises the javascript: href) | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q51 | qa-edge | a file named `a"b.csv` is served as `filename="ab.csv"` while the UI shows the original name | the same name, or RFC 5987 `filename*` | minor | engine | fixed (filename* keeps the original name) |
| Q52 | qa-edge | a new connection is created enabled while the toast says "switch it on to give it to the next run" | the toast and the state agree | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q53 | qa-edge | raw Zod wording in the UI: "Too big: expected string to have <=40 characters" | the app's own voice | minor | main (contracts) | fixed (messages in the contracts) |
| Q54 | reviewer | (same as Q47) startRun has no global cap; both callers are anonymous | refuse a start while 3 runs are in flight, plus a per-IP token bucket or a shared secret in both callers | major | engine | fixed (with Q47) |
| Q55 | reviewer | the form's Server Action runs the loop in the page's function, which exports no `maxDuration`; 240 s wall clock + judge + review can pass Vercel's 300 s, killing a run mid-evaluation ("evaluating" for ever) | `export const maxDuration = 300` on page.tsx; wall clock ~180 s so the whole tail fits | minor | main (page) | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q56 | reviewer | the download route decodes an already-decoded name: `100%25.csv` answers 500, `a b.csv` never matches; non-Latin-1 names throw; no `X-Content-Type-Options` | drop the decode; `filename` ascii fallback + `filename*`; nosniff | minor | engine | fixed (no double decode, filename*, nosniff) |
| Q57 | reviewer | the report renderer links any scheme from the agent's text (data:, vbscript:, file:); only javascript: is neutralised, by React | render `<a>` only for http(s), else plain text | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q58 | reviewer | the run directory is never removed; on Vercel /tmp accumulates until writes fail | `rm(dir, { recursive: true, force: true })` in the finally; the files are in the DB | minor | engine | fixed (run dir removed in finally) |
| Q59 | reviewer | a succeeded run whose evaluator crashed (verdict null) reads green "Done" like a pass | "Done - not checked" tone; store `{ verdict: "unknown", reasons }` instead of null | minor | ui + engine | fixed (unknown verdict stored; the UI shows the not-checked tone) |
| Q60 | reviewer | action errors forward any `Error.message` to the UI (database credentials, hosts) | log it; a fixed sentence to the user | minor | ui (actions) | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q61 | reviewer | `connection_used` treats "use the connected X if it helps" as a hard requirement | assert only on must/only/use-the-connected wording; else informational | minor | eval | fixed (connectionRequired reads the sentence that names the connection) |
| Q62 | qa-ux | the add-a-server dialog does not trap focus and has no `aria-modal`; Tab leaves it while open | focus cycles inside; aria-modal; Escape and focus return already work | major | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q63 | qa-ux | no dark mode at all: `.dark` never applied, no prefers-color-scheme handling; every `dark:` class is dead | a dark theme, or the classes removed plus `<meta name="color-scheme" content="light">` | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q64 | qa-ux | contrast: Run 3.65:1 (white on emerald-600), "1 run live" 3.20:1, selected row meta 4.35:1 | 4.5:1 (emerald-700, amber-700) | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q65 | qa-ux | prefers-reduced-motion is ignored by the stepper animations and the progress transition | no motion under reduce; final state painted | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q66 | qa-ux | switching runs blanks the right column (no skeleton, no old content) for 300 ms+, and the page jumps | keep the old panel or a panel-shaped Suspense skeleton; loading.tsx grid does not match the real layout | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q67 | qa-ux | a run whose result did not pass shows a full green progress bar above the red outcome | neutral or amber bar when the verdict is not a pass | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q68 | qa-ux | no aria-live region: the outcome change while polling is never announced | the outcome line in a `role="status"` region | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q69 | qa-ux | a switch is `disabled` while its action runs, so focus is dropped and a second Space does nothing | keep it enabled and ignore repeats, or restore focus | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q70 | qa-ux | tab order goes through every run row before the panel's controls (22 tabs, grows with runs); no skip link | a "Skip to the run" link or the panel first in DOM order at >= 900 px | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q71 | qa-ux | focus rings differ: the design ring on the form, the browser default on run rows and Details | one ring token on all focusables | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q72 | qa-ux | both download links are named "Download"; two files are indistinguishable to a screen reader | "Download nvidia_financials.csv (2.2 KB)" | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q73 | qa-ux | "INSTRUCTIONS" is a label, not a heading; the runs list has no landmark; the panel is not a named section | an h2 on the card, a named landmark for the list | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q74 | qa-ux | run rows truncate the instruction with no `title`; "19 s - $0.028" has no label | `title={run.prompt}`; "19 s, $0.03 spent" or cost under Details | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q75 | qa-ux | at 390 px the primary controls are under 40 px tall (Run 28, Download 26, switches 18) | 40 px minimum at mobile width | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q76 | qa-ux | at 390 px with a run open the instructions box is ~1000 px below the fold | a "New run" affordance in the header on small screens | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |
| Q77 | qa-func | the evaluator passed a CSV with a ragged row: an unquoted comma shifted the cells, `parses` accepted it (`relax_column_count`), `duplicates` counted "WION" as a URL, `freshness` silently dropped the row | a ragged row fails `parses` (or is named); freshness and duplicates report the rows they skipped | major | eval | fixed (strict field counts, urls check, skip counts; eval 10/10) |
| Q78 | qa-func | "Too big: expected string to have <=4000 characters" - raw Zod wording on the instruction field | one sentence in the app's voice | minor | main (contracts) | fixed (messages in the contracts) |
| Q79 | qa-func | the runs list row stays "Working on it" until a reload while the panel beside it already says "Done" | the row follows the run (poll refreshes the list, or router.refresh on terminal) | minor | ui | fixed (FIX4-ui, merged 26d78e2; e2e 24/24 on the QA db) |

## v2 (local, `v2` branch, QA database) - round 5, pinned at e777281

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q80 | reviewer | editing a connection's URL keeps its bearer token or OAuth tokens, and any member may edit: a member points the owner's GitHub connection at another host and the next run sends the owner's token there | a changed host clears the stored credentials (new token or sign-in needed); connection edits for owners and admins only | major | settings | fixed (b0cd616: another server clears the credentials; owners and admins only; e2e 10/10) |
| Q81 | reviewer | the url guard measures only the query string and fragment: data in the path (`/<base64 of output.csv>`) or a subdomain (`<data>.evil.example`) passes silently | long or high-entropy path segments and host labels go to the exfiltration question too | major | guards | fixed (543e5a3: path and subdomain measured; Jev blocks base64 in a path 0.87, a news link 0.26) |
| Q82 | reviewer | a run of an approved automation reads the automation's current template; an edit saved while the run is queued gives the agent the new, unapproved version and judges it against it | the run uses the version it was started with, or fails with the reason when it is gone | major | engine | fixed (0fce77d: a command or schedule run needs the automation active at its version; fails with the reason) |
| Q83 | reviewer | the OAuth discovery fetch follows redirects without re-checking them: a hostile server redirects to 169.254.169.254 or localhost | `redirect: "manual"`, each Location re-checked as a public address | major | oauth | fixed (1e5a780: redirect manual, each hop re-checked, 3 hops max) |
| Q84 | reviewer | nothing calls the cron route under RUNNER=inline: a schedule shows a next run that never fires, and `closeAbandonedRuns` never runs, so a run stranded by a restart holds an in-flight slot for ever | abandoned runs closed on the way into a start; the schedule form says when no scheduler is running | major | engine + automations | fixed (engine: stranded runs closed in startRun; automations: "Scheduled runs are not switched on here" when no scheduler runs) |
| Q85 | reviewer | Re-evaluate of a follow-up judges it on the change request alone ("Add a summary column"), dropping the parent's instructions the live evaluation used | re-evaluation rebuilds the same instructions as the live run | major | eval | fixed (02fc2d2: loadRun rebuilds the instructions with instructionsOf; int 7/7) |
| Q86 | reviewer | `safeNext` accepts `/%09/evil.example`: after sign-in the browser lands on evil.example | the next path must resolve to our own origin | minor | auth | fixed (a0ab872: resolved against our origin, control characters refused; 17/17) |
| Q87 | reviewer | the budget is counted, then the run inserted, with no lock: parallel starts all pass | count and insert in one transaction under a per-workspace advisory lock | minor | engine | fixed (14b6996: check and insert under a per-workspace advisory lock; 5 parallel starts, 3 pass) |
| Q88 | eval | `scripts/record-run.ts` records a follow-up with only its change as the prompt (it runs outside Next and cannot load `instructionsOf`) | a recorded follow-up case carries its full instructions | minor | eval | open (no follow-up case in the suite yet; label by hand until then) |
| Q89 | settings | GET /api/connections/oauth/start checks the session but not the role: a member calling it directly can start a sign-in that writes OAuth credentials | owners and admins only, the same rule as the settings actions | minor | oauth | fixed (111aed4: owner-or-admin before any discovery or cookie) |
| Q90 | qa-ux | 5 of today's 8 demo runs read "did not pass" only because their checks were stored before .svg/.xlsx were allowed | re-checked or removed from the demo workspace | major | main (demo data) | fixed (scripts/reevaluate.ts on the three chart runs: all pass; the remaining red runs failed for real reasons - a blocked local fetch, a refused injection, a run with no output tools) |
| Q91 | qa-ux | older seeded runs say "looks good" while Why? says "not checked" and Details "not judged" (an older stored check format) | the three agree | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q92 | qa-ux | the `\` command list at 1280 squeezes the automation's name to nothing behind a long technical "makes ..." line | command and name first, the output line truncated | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q93 | qa-ux | after picking a command the box shows `\news-digest ` with no hint of what to type | the input's label or hint shown after the command | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q94 | qa-ux | an automation run's title is its filled-in instructions | "<automation name>: <input>" | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q95 | qa-ux | example runs show the full prompt in the rail; "Example for an automation being tested" names no automation and stays after approval | the input as the title; "Example for <name>" linking to it | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q96 | qa-ux | tool names in plan step titles ("... using make_chart") | step titles in plain words | minor | guards (system prompt) | fixed (560f6be: plain step titles, never a tool or file name) |
| Q97 | qa-ux | markdown tables in the report render as raw pipes | rendered tables | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q98 | qa-ux | chart labels about 5 px, the x-axis title overlapping a tick label, a tiny pie legend | readable at 390 px | minor | outputs | fixed (dcae48a, 0a93a8c: 420x280, 15 px labels, slanted when crowded, the v2 palette) |
| Q99 | qa-ux | "0.0 KB" for a small file | bytes under 1 KB | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q100 | qa-ux | "No files yet - this run writes its answer in the report below" on finished and failed runs, even with no report | wording per state | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q101 | qa-ux | a failed run says "You can run the same instructions again" but offers only an unlabelled icon | a labelled "Run again" | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q102 | qa-ux | a failed run's Why? repeats the banner | Why? adds information or is hidden | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q103 | qa-ux | Details lists the built-in chart tool as a connection, and its Files row misses the tool-made files | built-in tools kept out of Connections; every file listed | minor | home (state.ts) | fixed (re-checked on the merged app, f44875d) |
| Q104 | qa-ux | the SEARCH badge in Details is unreadable in dark mode | readable in both themes | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q105 | qa-ux | rail rows with the same title cannot be told apart; red dots mean both "did not pass" and "went wrong", with no words | the outcome in words on hover and for screen readers | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q106 | qa-ux | the ready automation page: "Turn off" unexplained, two primary buttons, the Run input unlabelled | one primary action, labelled input, Turn off beside the status with a line | minor | automations | fixed (one primary Run, labelled input, Turn off beside the status) |
| Q107 | qa-ux | schedules offered in UTC only, a raw cron field up front, the scheduled input empty despite an example | local time, cron as an advanced option, the example prefilled | minor | automations | fixed (local time, cron as advanced, the example prefilled) |
| Q108 | qa-ux | "New from a run" lists runs that did not pass first | good runs first, the others marked | minor | automations | fixed (runs that did well first, the others marked) |
| Q109 | qa-ux | a pending invitation disappears on reload: its link cannot be found again or revoked | a pending list with Copy link and Revoke | minor | auth (lib) + settings (page) | fixed (auth: listInvitations, revoke, the pending list with Copy link and Revoke on Members) |
| Q110 | qa-ux | sign-up with a taken email says "Sign in instead." as plain text | a link to sign-in with the email filled in | minor | auth | fixed (auth: a link to sign-in with the email filled in) |
| Q111 | qa-ux | the main button is green on Home and Automations, near-black elsewhere | one primary style | minor | main | fixed (d4992fa: the ink pill for every primary) |
| Q112 | qa-ux | Settings repeats its tab name as a card title (Connections, Members) | no repeated heading | minor | settings | fixed (dd6025b: no repeated headings) |
| Q113 | qa-ux | the product name "Automations" reads as a second nav link; on a phone the workspace name is hidden | a distinct product mark; the workspace named in the phone menu | minor | home + auth | fixed (re-checked on the merged app, f44875d) |
| Q114 | qa-ux | "Stopped by you" also when another member stopped it; a skipped step counts toward "4 of 4" | "Stopped"; "3 of 4 done, 1 skipped" | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q115 | qa-ux | every page logs "Only plain objects can be passed to Client Components ... Set objects are not supported" in dev | no error | minor | home | dev only: Next puts a Set of missing slots into its own dev payload; not in a production build |
| Q116 | qa-func | a command to a turned-off or draft automation answers "There is no saved automation called \x" | runCommand's own words ("is turned off", "is not approved yet") | minor | home (actions) | fixed (re-checked on the merged app, f44875d) |
| Q117 | qa-func | with automations that are all off or draft, the `\` list says "No saved automations yet" | "none ready yet" wording | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q118 | qa-func | the `\` list and the automation card show the raw placeholder: "makes facts.md with three facts about {input}" | the input's label in place of `{input}` | minor | home + automations | fixed (the input label in place of {input}) |
| Q119 | qa-func | reloading /automations/new?run=<id> while it drafts leaves two drafts | one draft per press | minor | automations | fixed (one draft per press) |
| Q120 | qa-func | "Schedule saved." / "Schedule removed." never show: the form is keyed by updatedAt and remounts on save | the confirmation line shows | minor | automations | fixed (the confirmation stays) |
| Q121 | qa-func | "Make an automation" is offered on a run whose verdict failed | offered only for a passing result | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q122 | qa-func | mid-run, after a file was written, "No files yet - this run writes its answer in the report below" | "files appear when it finishes" while live | minor | home | fixed (re-checked on the merged app, f44875d) |
| Q123 | qa-func | Details > State lists only the Write tool's files, not the chart and spreadsheet (same as Q103) | every file | minor | home (state.ts) | fixed (re-checked on the merged app, f44875d) |
| Q124 | qa-func | .svg and .xlsx outputs get no content check, and "The file has content" names no file | a check per output kind, naming the file | minor | eval | fixed (5a93093: chart and spreadsheet checks, every check names its file; suite 18/18) |
| Q125 | qa-func | .xlsx served with "; charset=utf-8" | no charset on a binary type | minor | outputs | fixed (07469f9) |
| Q126 | qa-func | two connections whose names map to the same key are both accepted; one silently replaces the other in a run | the second name refused as taken | minor | settings | fixed (b27d9cb: refused beside the Name field) |
| Q127 | qa-func | every url-guard block reads "A web page tried to make the agent send your data elsewhere", also for a private address or a site blocked in Settings | wording by cause | minor | home (guard-notice) | fixed (re-checked on the merged app, f44875d) |
| Q128 | qa-func | a run the model refused shows one text event; the refused action (turns 1-2) is not in the timeline | the refusal visible in the timeline | minor | engine (map-message) | fixed (67ec481: every refusal and error shape in sdk.d.ts becomes a plain notice; the QA run itself was deleted, so the exact case is unconfirmed) |
| Q129 | qa-func | a stopped run records no cost or duration, so Limits' "Spent today" leaves it out | the partial cost recorded | minor | engine | fixed (8ab2600: cost from the result or the SDK's cost-state, else the duration; follow-ups no longer count their parent's cost) |
| Q130 | qa-func | a stale session cookie on a deep link redirects to /sign-in without ?next= | next kept | minor | auth | fixed (auth: the requested path kept through a stale cookie) |
| Q131 | qa-func | "Controller is already closed" logged when a client leaves the event stream mid-read | a quiet end | minor | engine | fixed (3c39242) |
| Q132 | qa-func | POST /api/runs with a non-JSON body answers Zod's wording, and runs `\cmd input` as paid free text where Home refuses it | plain words; the same command rule as Home | minor | engine | fixed (14ca4e4: plain words; parseCommand then runCommand, else startRun) |
| Q133 | qa-func | the rail search does not match a run's command | a match | minor | home | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q134 | final | a run started from a worktree dev server was given the developer's claude.ai connectors (Gmail, Plane, Docs): the child inherits the parent's environment and connector settings, and permissions are bypassed | a run sees only its workspace's connections: strict MCP config, claude.ai connectors off, an allowlisted child environment, and a guard that blocks any MCP tool not ours or the workspace's | major | engine + guards | fixed (guards 474d81a; engine 312a9e5, d418c36: an allowlisted child environment, strict MCP config, claude.ai connectors off, a tripwire on init - live: only DeepWiki, plan and outputs) |
| Q135 | final | the composer's text is 14 px on desktop (shadcn's md:text-sm wins) while its hint and the handover copy are 19 px: the brief jumps and rewraps on Run | one size for the box, the hint and the handover | major | home | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q136 | final | thread nodes centred on the whole step (title and note), not the title | nodes beside the title's first line | major | main (thread) | fixed (d7689ae) |
| Q137 | final | the thread is not the memorable element: no thread on the first visit, a thin line under a 34 px four-line title | a heavier thread (d7689ae), the title at most two lines, a quiet thread on the first visit | major | home + main | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q138 | final | the handover: 1.1 s of nothing after Run, two differently wrapped copies cross-fading, then 5 s of "reading your brief" with no thread | the move starts on the press and lands on a thread with its first bead | major | home | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q139 | final | the Automations gallery is the most default-looking screen: the command breaks at its hyphen, no press feedback | built around the command token and a mini thread; the command never breaks | minor | automations | fixed (78b53be) |
| Q140 | final | hovering a rail row squeezes its title to two characters | the title stays readable | minor | home | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q141 | final | charts are white slabs in dark mode | charts that follow the theme | minor | outputs | fixed (0b449ee: transparent, a style block with a dark-scheme twin; da4ceec: date axes) |
| Q142 | final | a chart is labelled "contains 2 payment card numbers" (long decimals pass the card check) | no card warning on decimals or charts | minor | guards | fixed (474d81a: no card inside a decimal; charts skip phone/card/IBAN counts; hand-written .svg/.xlsx refused) |
| Q143 | final | press feedback missing on rail rows, New run, top-bar links, Why?, gallery tiles; no focus ring on the composer capsule | the same press feedback and a visible focus everywhere | minor | home + automations | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q144 | final | inline code in the report is monospace; some reports show "Report" twice | no monospace in the glance view; one heading | minor | home | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q145 | final | page titles differ (34, 40, 44 px) and every display size has the same tracking | one page-title size, tracking by size | minor | main + owners | fixed (page-title / run-title utilities used by every page) |
| Q146 | final | a focused row in the Add a server dialog draws a square ring over the group's rounded corners | the ring follows the shape | minor | settings | fixed (ca8a6cf) |
| Q147 | final | connection names under the composer run together ("DeepWiki e2e Settings moved"); a settings e2e leaves a connection and invitations behind | separated names; tests clean up | minor | home + settings | fixed (home a79f939; checked with screenshots and e2e 76/76) |
| Q148 | engine (live heal) | auto-heal went back and forth: the CSV check demanded quotes, the reviewer held the agent to "without adding any quotes", and each attempt undid the last | a valid file wins over an instruction it cannot satisfy (the report says why), the reviewer never asks for a change that fails a check, and healing stops when an attempt makes no progress | major | eval + engine | fixed (eval 189c7a3: a valid file wins, the reviewer sees the checks - live 20/20; engine 0ae0311: stops when an attempt makes no progress) |
| Q149 | engine | each attempt's finished event shows the SDK's running total, and the heal prompt repeats the feedback's lead and closing lines | per-attempt cost in Details, one total on the run; no repeated lines | minor | engine + home | fixed (home a79f939; checked with screenshots and e2e 76/76) |

### Round: Handover live (https://handover-gold.vercel.app, 2026-09-23)

The first deploy of v2 was refused (the Hobby plan's 12 functions: the agent's binary in every route made each
route a function of its own). Runs now execute in `/api/runner/<id>`, the only function with the binary
(RUNNER=route, 72f6866). Then qa-func walked the live app as the demo account, at 1280 and 390 px, with three runs.

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q150 | qa-func (live) | a correct, titled bar chart failed "no title": the chart tool wraps a long title into two `<tspan>` lines and the check read only up to the first tag; self-heal then looped on the false failure | a wrapped title counts | blocker | main (eval) | fixed (2ebe4f5; live on 7ce243f: the same two-line title read in full, the run passed) |
| Q151 | qa-func (live) | "Make the bars horizontal" could not be done: the chart tool drew only vertical bars | horizontal bars | major | main (outputs) | fixed (88f1083: kind horizontal-bar; live: the follow-up drew horizontal bars and passed) |
| Q152 | qa-func (live) | a chart-only run's Why? said it "may have followed instructions it found on a page"; it read no page | no such warning when nothing outside was read | major | main (eval) | fixed (f1d8203; live: a chart-only run asked two questions and Why? says nothing about pages) |
| Q153 | qa-func (live) | a doubted step read "This step may not have done what it says. May not have done what it says: ..." | the sentence once | minor | main (home) | fixed (ddd6467; live on the CSV run) |
| Q154 | qa-func (live) | a fix attempt called set_plan again and the person's steps left the thread | the plan kept, the fix added as a step | minor | main (engine) | fixed (re-checked in the deep QA round), was re-check (ddd6467: the fix prompt says keep the plan; no live run needed a fix since) |
| Q155 | qa-func (live) | a report opening with a bold "Report:" line under the page's "Report" heading | the word once | minor | main (home) | fixed (ddd6467; live: both reports open with a sentence) |
| Q156 | qa-func (live) | an unknown invitation link said "This invitation is closed" | "We could not find this invitation" | minor | main (auth) | fixed (ddd6467, e2e; live, signed in and out) |
| Q157 | qa-func (live) | on a horizontal bar chart the value labels "80" and "90" nearly touch | labels apart | minor | main (outputs) | fixed (about five ticks on the value axis; next deploy) |
| Q158 | him (live) | a command's hint that wraps ("/model-scores Comma-separated list of...") runs over the composer's controls | the box grows with the hint | minor | main (home) | fixed (input and hint in one grid cell; e2e at phone width) |

### Round: v2 deep QA (2026-09-23, after the link went to the reviewer)

Production stayed read-only (anonymous GETs only). Two functional agents (runs and automations; accounts, roles and
tenancy), a UX review of every screen at 1280 and 390 px in light and dark, and two code reviews (security and
tenancy; the engine) ran against the local app and its own database. Workspace isolation held on every path tried.
Fixes are made locally, on branches merged into v2; the next deploy is his call. "Fixed locally" means tested
(`npm run check` 1621, integration 178, e2e 99 plus invite-only 8) but not yet live.

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q159 | reviewer (engine) | on Vercel a run can outlive its 300 s function (agent 240 s, then step checks and an unbounded evaluation); the killed run stays "running"/"evaluating" for ever, and Stop is never read | every run closes: the evaluation time-boxed, the agent's budget leaves room for it, a dead run closed when it is read or stopped | major | engine | fixed locally (agent 230 s, evaluation boxed at 50 s, step checks at 10 s; a run past 6 min closed when read or stopped; heal.int, jobs.int, cancel.int, route tests) |
| Q160 | reviewer (engine), qa-ux | after a self-heal the run's report is only the fix note ("What I changed: ...") | the whole task's report, with one line on the fix | major | engine | fixed locally (the fix and the follow-up prompts ask for the whole task's report; new runs only - the local healed run keeps its old report) |
| Q161 | reviewer (engine) | a run ended by the wall clock, the tripwire or a crash records no cost, so the daily budget never sees it | the cost so far recorded on every way out | major | engine | fixed locally (one runTotals for Stop and every failure path; heal.int) |
| Q162 | reviewer (engine) | on a follow-up, Make an automation drafts from the change alone and Run again starts a paid run whose brief is only "Make the bars horizontal" | both use the whole thread's instructions | major | engine | fixed locally (instructionsOf in the draft; Run again sends only the run id; from-run.int, run-again.int) |
| Q163 | reviewer (engine) | `$&`, `$$` or `$'` in a command's input are read as replacement patterns ("{input}" left in the prompt) | the input as typed | minor | engine | fixed locally (a replacer function; template.test) |
| Q164 | reviewer (engine) | a chart field named "revenue.usd" draws no marks, and the chart check passes it | the field drawn; an empty chart fails | minor | engine | fixed locally (field names escaped; a chart with rows and no mark fails; chart and check tests) |
| Q165 | reviewer (engine) | a Stop between a verdict and the next fix attempt lets that attempt run to its end | no attempt starts after Stop | minor | engine | fixed locally (a Stop is read before each attempt; heal.int) |
| Q166 | reviewer (engine) | fix attempts never re-check the daily budget | healing stops when the budget is used up | minor | engine | fixed locally (the day's budget checked before each fix; heal.int, budget.int) |
| Q167 | qa-func (admin), reviewer (security) | a plain member can read pending invitation ids (members page, Better Auth's list-invitations), sign up with the invited email and join as admin; anyone knowing an invited email can take the account first | ids only for admins; sign-up needs the invitation from the link | major | auth | fixed locally (Better Auth hooks keep invitation ids for admins; invite-mode sign-up needs the link's id in a cookie; auth.int, e2e invite-only 8/8) |
| Q168 | reviewer (security) | the private-address check reads the spelling only: `[::]`, `[::7f00:1]`, `100.100.100.200`, NAT64 and DNS names that resolve inside pass (connections, OAuth fetches, WebFetch) | addresses parsed and resolved; any internal one refused | major | connections | fixed locally (node:net BlockList and DNS lookups on save, OAuth fetches, WebFetch and run start; 76 hosts in address.test) |
| Q169 | qa-func (admin) | an owner or admin cannot remove a member or change a role from the app (only through the auth API) | Remove and a role choice on Members | major | settings | fixed locally (his go-ahead; member-rules, auth.int, e2e; see the next round) |
| Q170 | qa-func (admin) | inviting an address again with another role keeps the old role | the new role, or a message | minor | auth | fixed locally (the pending one revoked, a new one with the new role; auth.int) |
| Q171 | qa-func (admin) | switching to a workspace one is not in is a 500 | refused in plain words | minor | auth | fixed locally (trySwitchWorkspace, shown in the menu; actions.test, e2e) |
| Q172 | qa-func (admin) | turning off or deleting another workspace's connection by id says nothing went wrong | "This connection was not found" | minor | settings | fixed locally (ConnectionNotFoundError; store.int, actions.test) |
| Q173 | qa-func (admin) | no frame-ancestors / X-Frame-Options, no nosniff, `x-powered-by` sent: sign-in and Settings can be framed | the headers set | minor | main | fixed locally (next.config.ts headers; next-config test, e2e) |
| Q174 | reviewer (security) | `?oauth_error=<text>` is shown word for word as the app's own error toast | codes mapped to our sentences | minor | connections | fixed locally (codes, the page words them; route tests, e2e) |
| Q175 | reviewer (security) | no deployment-wide cap on runs in flight: every account can make workspaces, each with its own limits, on one key | a cap across workspaces | minor | engine | fixed locally (six in flight across workspaces under a global lock; start.int) |
| Q176 | qa-func (admin) | sign-in rate limiting is Better Auth's in-memory default, per function instance | a shared store | minor | auth | fixed locally (the rate_limit table; rate-limit.int, e2e) |
| Q177 | qa-func (admin) | `/api/health?deep=1` is anonymous and makes a model call each time | cached or gated | minor | main | fixed locally (60 s per instance; cache.test, route.test) |
| Q178 | qa-func (admin) | any member can edit, approve, turn off or delete any automation | his call: members may, or admins only | question | automations | fixed locally (his call: owners and admins approve, switch, delete, schedule and rename a Ready command; who judged is recorded) |
| Q179 | qa-ux | a chart's preview box is white in dark mode, so the chart's light text is invisible | the box follows the theme | major | home | fixed locally (the box is paper; e2e light and dark) |
| Q180 | qa-ux | the report-only automation /compare-concepts fails "a file was written": "Write a short answer" reads as asking for a file | "write" counts only with a file as its object | major | eval | fixed locally (write counts only with a file; checks.test) |
| Q181 | qa-ux, qa-func | a healed run says "3 of 3 done" above four thread nodes | the count agrees with the thread | minor | home | fixed locally ("4 of 4 done"; screenshot) |
| Q182 | qa-ux, qa-func | Details on a healed run: two groups keyed "step-2" (React warning) | unique keys | minor | home | fixed locally (one group per visit to a step; group-events.test) |
| Q183 | qa-ux | tool names in step notes, the report and the reviewer's quoted reasons ("WebFetch blocked ... no shell/curl tool") | plain words | minor | engine | fixed locally (a plain-words rule for the agent and the reviewer; new runs only) |
| Q184 | qa-ux | Why? sentences such as "The judge was sure the result does not answer your instructions but not that the plan was finished"; chained colons | one readable sentence each | minor | home | fixed locally (why.test, e2e) |
| Q185 | qa-ux | finished runs show a pending "Planning" and "waiting for the result..."; the failed banner points to Details, which has only a raw error | no pending marks on a finished run; the cause in the banner | minor | home | fixed locally (failure.test, e2e) |
| Q186 | qa-ux | the steps of a run that did not pass are red circles with check marks | steps that ran look done; only the outcome is red | minor | home | fixed locally (e2e) |
| Q187 | qa-ux, qa-func | Details: a local read badged "fetch", the machine's absolute path in tool results, the report as raw markdown pipes | "read", a path inside the run, no raw markdown | minor | home | fixed locally (format.test, group-events.test) |
| Q188 | qa-ux | the / command list covers the Run button; its output line is raw column names | Run visible; plain words | minor | home | fixed locally (e2e, command-query.test) |
| Q189 | qa-ux | the rail search shows the browser's blue clear button | graphite or none | minor | home | fixed locally (e2e) |
| Q190 | qa-ux | an automation run's rail row repeats the command as a tag and truncates the input | no repeated name | minor | home | fixed locally (rail.test, e2e) |
| Q191 | qa-ux | the unknown-invitation page signed out offers "Go to your workspace" | "Sign in" | minor | auth | fixed locally (e2e) |
| Q192 | qa-ux | the workspace menu's white popover has no visible edge in light mode | a hairline edge | minor | home | fixed locally (screenshot, light and dark) |
| Q193 | qa-ux | inactive Settings tabs at 4.44:1 | 4.5:1 | minor | settings | fixed locally (5.56:1 light, 7.77:1 dark) |
| Q194 | qa-ux | the sign-in demo card grows as it plays (layout shifts ~22 px) and never reaches done | fixed height, ends green | minor | auth | fixed locally (e2e sign-in-demo, screenshot) |
| Q195 | qa-func | a double-click on Run (or a second Cmd/Ctrl+Enter) started two identical paid runs 0.5 s apart | one press, one run | major | home | fixed locally (the composer locks on the press; e2e one press, one start) |
| Q196 | qa-func | Check the result again with the model down turned a stored pass into "not checked", silently | the earlier verdict kept, the failure said | minor | eval | fixed locally (reevaluate.test, reevaluate.int) |
| Q197 | qa-func | a command with a 3,900-character input: POST /api/runs answers 500 with an empty body; Home says the brief is over 4000 characters; the input limit is never checked | the input limit enforced in plain words; 400 on the API | minor | automations | fixed locally (store.int, route test) |
| Q198 | qa-func | Details shows "turn 31 of 25"; a healed run shows only its last attempt's turns | one number that agrees with the cap | minor | engine | fixed locally (state.test, format.test) |
| Q199 | qa-func | a stopped run's Details show Duration and Cost "-" although both are stored | the stored values | minor | engine | fixed locally (state.test) |
| Q200 | qa-func | a NUL byte in a file name answers 500 on the file route | 404 | minor | engine | fixed locally (queries.int) |
| Q201 | qa-func | unknown pages show Next's bare 404 with no way back | an in-app not-found page | minor | home | fixed locally (e2e, screenshot) |
| Q202 | qa-func | a composer error stays after the text changes | cleared on edit | minor | home | fixed locally (e2e) |
| Q203 | qa-func | an invalid composer draws a square pink border inside the rounded capsule | the error in the capsule's shape | minor | home | fixed locally (e2e) |
| Q204 | qa-func | runs of a deleted automation are titled by the bare input | read as plain runs | minor | home | fixed locally (rail.test) |
| Q205 | qa-func | a follow-up's carried-over .xlsx loses its sheet summary | the parent's summary | minor | home | fixed locally (file-kind.test, e2e) |
| Q206 | qa-func | "Too many runs from this address" gives no time to retry | when to retry | minor | engine | fixed locally (limits.test) |
| Q207 | qa-func | tool results in Details show the machine's full path (/Users/.../runs/<id>/countries.csv) | the path inside the run | minor | home | fixed locally (with Q187) |
| Q208 | qa-func | with the model down the step checks vanish silently and "Done - not checked" has no retry on the main view | said in plain words, Check again beside the outcome | minor | home | partly fixed locally (the outcome says it was not checked, with Check again; e2e) - Details still shows no step checks without saying why |
| Q209 | qa-func | only Cmd/Ctrl+Enter submits, and that is hinted nowhere | a quiet hint near Run | minor | home | fixed locally (a quiet "⌘ Enter" / "Ctrl Enter" beside Run on desktop; e2e) |

### Round: roles and limits (2026-09-23, his go-ahead on Q169, Q176-Q178)

Built locally, then a functional QA (every rule through the UI and forged at the actions and Better Auth's routes), a
UX review of the changed screens and a code review of `4327198..HEAD`. Production untouched.

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q210 | reviewer | production's database has neither the `rate_limit` table nor `runs.human_verdict_by`; deployed first, every sign-in and every page reading runs fails | the two additive statements run on production before the deploy | blocker (deploy order) | main | fixed (both statements run on production before the deploy of 589d372; sign-in routes answer 200 live) |
| Q211 | reviewer, qa-func | two owners demoting or removing each other at once both pass (5 of 5): the workspace ends with no owner | one refused; one owner always stays | minor | auth | fixed locally (one change at a time per workspace under an advisory lock, owners re-counted; parallel int test) |
| Q212 | reviewer | a member's command rename read the status before an admin's approval and landed on the approved automation | the rename refused once it is approved | minor | automations | fixed locally (the rename writes only onto a draft; store.int) |
| Q213 | reviewer | a removed or demoted admin's pending invitations stay open, so they could rejoin through one | cancelled with the removal or demotion | minor | auth | fixed locally (their pending invitations cancelled in the same locked step; auth.int) |
| Q214 | qa-ux | a member's approval bar says "approves it once an example looks right" when one already does and another is marked not right | the real reason, then who approves | major | automations | fixed locally (the member reads canApprove's reason, then who approves; approval.test, e2e) |
| Q215 | qa-ux | the role menu's meanings do not mention approving automations | Admin: also approves automations | minor | settings | fixed locally (e2e) |
| Q216 | qa-ux | a member's Members page says only who invites | who invites, changes roles and removes | minor | settings | fixed locally (e2e) |
| Q217 | qa-ux | the read-only command looks like an empty editable field in dark mode | a clearly read-only field | minor | automations | fixed locally (e2e, screenshots) |
| Q218 | qa-ux | that saving takes a Ready command out of use is small grey text under Save | said beside Save, naming the command | minor | automations | fixed locally (e2e) |
| Q219 | qa-ux | "Change" on a colleague's judgment replaces it without saying so | the control names whose judgment is replaced | minor | automations | fixed locally ("Replace <name>'s judgment"; verdict-words.test, e2e) |
| Q220 | qa-ux | an Off automation's empty history says "Run it above, or call it from Home" | "No runs yet." | minor | automations | fixed locally (e2e) |
| Q221 | qa-ux | automation Delete asks through the browser's confirm, on a grey button | the app's confirmation sheet, a red Delete | minor | automations | fixed locally (the app's sheet with a red Delete; e2e) |
| Q222 | qa-ux, qa-func | the rate-limit message says "Wait a minute"; the block lifts after 10 s | matching words | minor | auth | fixed locally ("Wait a few seconds"; errors.test, e2e) |
| Q223 | qa-ux | "Marked: looks right" is a label-and-colon line | "Marked as looking right" | minor | home | fixed locally ("Marked as looking right"; verdict-words.test) |
| Q224 | qa-ux | the dialog sheet has almost no edge in dark mode | a hairline edge | minor | main | fixed locally (screenshots) |
| Q225 | qa-func | a member renames an approved command in two saves (an edit sends it to draft, then the draft's command is free) | the command of a once-approved automation is for owners and admins | minor | automations | fixed locally (a once-approved automation's command is for owners and admins in the check, the write and the editor; it also locks a draft whose earlier example looked right) |
| Q226 | qa-func | a removed person's open tab: invite, connections, limits and a Home run land in their own workspace without a word | refused: "You are no longer in that workspace" | minor | auth | fixed locally for writes that name no record (a run, an invitation, a connection, the limits); one that names a record still answers "not found" |
| Q227 | qa-func | a refused Remove leaves its dialog open behind the error | the dialog closes | minor | settings | fixed locally (e2e) |

### Round: six agents (2026-09-24, his go-ahead: "deploy multiple QA agents ... fix obvious and run product decisions by me")

Three QA agents (qa-ux: every screen at 1280 and 390, light and dark, owner and member; qa-func: gates, every route
and action forged, races, database integrity; qa-ai: 12 real runs, the live and replayed suites, 6 evaluator probes)
and three code reviews (security and tenancy; engine and model calls; frontend and actions) ran against the local app
and the QA database. Production was read only (GETs, and read-only SELECTs before the schema statements). Gates at the
start: check 1707, integration 205, e2e 107, all green; live suite 20/20. Five fix agents worked on branches merged
into main (fix-fe, fix-engine, fix-sec, fix-ui, fix-ai, then fix-final for his last four calls). "His call" rows record
what he chose.

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q228 | review-fe 1 | saving a Ready automation's brief lost "Saved. This is version N now" (the document remounts elsewhere in the tree) | the message kept | major | fix-fe | fixed (automation-save.tsx; e2e) |
| Q229 | review-fe 2 | example cards offer a held-back file as a plain download (409) | said held back, taken from the full run | major | fix-fe | fixed (example-files.tsx; test) |
| Q230 | review-fe 3, qa-func F9 | an example's and Run now's input had no 2000-character limit | the command's limit, in the action and the store | major | fix-fe | fixed (tests) |
| Q231 | review-fe 4 | no error boundary outside Settings: a failed action or transition shows Next's bare error page | a calm Try again | major | fix-fe | fixed ((app)/error.tsx, global-error.tsx; tests) |
| Q232 | review-fe 5 | Details on a phone covers the run, but Tab reaches the hidden controls under it | his call: a modal on phones, the side panel on desktop | minor | fix-final | fixed (a modal sheet below 640 px, focus kept inside; e2e at 390) |
| Q233 | review-fe 6-21 | skip link with no run, drafting pulls the person back, a waterfall of reads on a run page, the stream re-reads the whole run each second, no reconnect backoff, polling a 404 for ever, Cancel restores refused values, gallery skeleton on an automation, same judgment leaves the form open, thread re-measures every render, faint focus rows, aria-expanded, live region, a stale connection switch, full connections sent to the client, dead code | each fixed | minor | fix-fe | fixed (a test per item) |
| Q234 | review-sec, qa-func | the events stream kept sending a run to someone removed from the workspace for ~5 minutes | ends within ~15 s | minor | fix-fe | fixed (route test) |
| Q235 | review-engine 1 | the 50 s evaluation box was smaller than the judge's and the reviewer's own timeouts | inner calls budgeted inside the box | minor | fix-engine | fixed (tests) |
| Q236 | review-engine 2 | AI_MODEL_FALLBACK did nothing where agents run (Anthropic always wins, no fallback); models.md described another setup | his call: Anthropic, plus an OpenRouter fallback; docs say what runs | major | fix-engine | fixed (ai.test; OPENROUTER_API_KEY is set in production) |
| Q237 | review-engine 3 | connection_used built the tool name from the name as typed ("Deep-Wiki" looked for `mcp__deep-wiki`): false fails and wasted heals | the stored key | major | fix-engine | fixed (checks.test) |
| Q238 | review-engine 4 | a follow-up that reads no page itself was never asked the in-bounds question | a follow-up counts as having read outside text | minor | fix-engine | fixed (judge.test) |
| Q239 | review-engine 5, qa-func F12 | a schedule turned back on fires its missed slot at once (08:00 digest at 15:00) | his call: a slot over an hour late is skipped; on or approved counts from now | minor | fix-engine | fixed (unit and int tests) |
| Q240 | review-engine 6 | a scheduled start refused by a limit was only logged | his call: the last skip and its reason beside the schedule | minor | fix-engine | fixed (automations.last_skipped_at/_reason; tests) |
| Q241 | review-engine 7 | runs in flight counted $0 against the day's budget: a day could end dollars over | his call: each run in flight and each fix holds back $1 | minor | fix-engine | fixed (budget-rule tests) |
| Q242 | review-engine 8-17 | list and page reads too wide, turns over-counted, unbounded judge input, decide() answers not shape-checked (NaN%), one failed write failed the run, a stopped heal recorded $0, no worker heartbeat, a parse failure shown as raw Zod JSON, heal fingerprint with percentages | each fixed | minor | fix-engine | fixed (a test per item) |
| Q243 | qa-func F24 | a Stop landing after the agent finished threw the answer away | his call: Stop ends only work in progress; the answer is kept | minor | fix-engine | fixed (int test) |
| Q244 | review-sec 1 | no spend cap per person or deployment: unlimited workspaces at $1000 a day each | his call: a deployment daily cap (DEPLOYMENT_DAILY_BUDGET_USD, default $50) and at most 5 workspaces a person | major | fix-sec | fixed (tests) |
| Q245 | review-sec 2 | the url guard let personal data out in short addresses (`/leak/j.smith@corp.com/...`) | the personal-data detectors run over each address | major | fix-sec | fixed (carried.test) |
| Q246 | review-sec 3 | OAuth tokens written onto a connection repointed during the exchange | written only if the address is unchanged | minor | fix-sec | fixed (complete.test) |
| Q247 | review-sec 4, qa-func F2-F4 | Better Auth's organization write endpoints over HTTP skipped the app's rules: two owners demote each other (no owner left), renames, 3000-character names, deleting a workspace leaves its schedules firing | refused over HTTP; the app's actions only; deletion off; the tick joins organization | minor | fix-sec | fixed (auth tests, schedules-orphan.int) |
| Q248 | review-sec 6, 8, 12, 13; qa-func F8, F23 | localhost origins trusted in production; held-back files sent to the judges; the cron secret compared with `!==`; the only CSP was frame-ancestors; the inline SVG lost its own CSP; the cron route named a missing setting | each fixed | minor | fix-sec | fixed (tests; e2e headers.spec on a production build) |
| Q249 | review-sec 11 | invite-only: any account could invite any address to its personal workspace and register it itself | his call: an invitation to a personal workspace opens no sign-up | minor | fix-sec | fixed (auth-invite-only e2e) |
| Q250 | qa-func F14 | a mistyped command (`/über test`, `/audit, Apple`) became a paid free-text run | his call: any `/` word is a command; an unknown one is refused, no run | minor | fix-sec | fixed (command tests, route 400) |
| Q251 | qa-func F1, F5-F7, F10, F11, F13, F15-F17, F19-F22 | NUL bytes 500; duplicate invitations and memberships; duplicate connection names; a command clash reads "Something went wrong"; any run could be judged as an example; deleting a missing automation looked done; Zod's raw message on a schedule; the API ignored a left workspace; forged invitation ids 500; budgets in fractions of a cent; "only a finished run" for a stopped one; machine paths in the run API; no length caps; int tests left settings rows | each fixed | minor | fix-sec | fixed (tests; two unique indexes) |
| Q252 | review-sec 7 | plain members see full connection addresses, which can hold a key | his call: members see the host only; the form warns | minor | fix-final | fixed (members are sent scheme://host:port only; the form's note; e2e) |
| Q253 | review-sec 10, qa-func F18 | Check again and Make an automation are paid calls outside the budget and any rate limit | his call: a cooldown each, and their cost counts toward the day | minor | fix-final | fixed (one Check again per run a minute, 3 drafts per workspace per 10 minutes, their cost in model_spend counts toward the day and the deployment cap; int tests) |
| Q254 | review-sec 5 | a connection's MCP client may follow a redirect into an internal address (not proven) | recommended: accept and document for now | minor | main | accepted (his go-ahead on the recommendation): documented in CODE-TOUR and README, the proxy is the future fix |
| Q255 | review-sec 14 | the seed's demo password might exist in production | none there | major if real | main | checked: production has no credential for the demo user |
| Q256 | qa-ai F1 | the judge could not see a chart's values or a spreadsheet's cells: a chart with a wrong value passed | the judge and reviewer read the data | major | fix-ai | fixed (suite case chart-wrong-value) |
| Q257 | qa-ai F2 | nothing asked whether facts and numbers were right: invented holidays passed at 86% | his call: a fourth Jev question, and number answers go to the reviewer | major | fix-ai | fixed (suite case invented-holidays) |
| Q258 | qa-ai F3 | a truthful "cannot be done" or "what do you mean?" failed at 90-95% and was healed twice | his call: outcomes "Could not be done" and "Needs your answer", never healed | major | fix-ai | fixed (two suite cases; live runs) |
| Q259 | qa-ai F4 | a judge-only fail was healed on generic feedback, attempts repeating the same result | the reviewer first; heal only on something to act on | major | fix-ai | fixed (feedback tests) |
| Q260 | qa-ai F8 | steps the agent forgot to tick cost a correct answer its pass and read "Not started" | his call: a quiet "not marked" state | minor | fix-ai | fixed (tests) |
| Q261 | qa-ai F12 | /news-digest used 24 of 25 turns | his call: 40 turns, the $1 budget unchanged | minor | fix-ai | fixed |
| Q262 | qa-ai F5, F7, F9-F11; qa-ux U6, U7, U10, U23 | heal wording in reports; "with the columns a, b, c" missed; reports opening mid-thought; pasted text never asked in-bounds; a lenient reviewer; three outcome punctuation styles; "Done" vs "Not checked"; a failed check named by its pass label; "judge" on the glance view | each fixed | minor | fix-ai | fixed (tests; live suite 24/24) |
| Q263 | main (merge) | a held-back spreadsheet reached the judge through the spreadsheet tool's input (S8 met F1) | left out | minor | main | fixed (from-events.test) |
| Q264 | qa-ux U1, U2 | Ask for a change's Send sat under the composer; single line breaks in the report were joined | Send clear; breaks kept | major | fix-ui | fixed (e2e, markdown tests) |
| Q265 | qa-ux U3 | a refused Run plays the handover, then snaps back | his call: refused in place, no handover | major | fix-final | fixed (Home reads the limits and refuses in the box, no handover; e2e) |
| Q266 | qa-ux U4, U5, U8, U9, U11-U15, U17-U19 | sign-up from an invitation said "a workspace of your own"; every tab titled "Handover"; ISO hover time; tenths of seconds; a 110 px jump after Run; invite words; "Not started" read in the gallery; no way back from a missing automation; focus lost after a wrong password; an approver not told the command goes out of use; a member's Limits looked editable; "1 d ago" vs "Yesterday" | each fixed | minor | fix-ui | fixed (tests, screenshots) |
| Q267 | qa-ux U16 | "Set objects are not supported" in the dev console after an unknown URL | a Next 16 dev-only log | minor | fix-ui | noted in CLAUDE.md, Patterns that bit |
| Q268 | qa-ux U20-U22, U24-U32; qa-ai F6, F13, F14 | long brief cut, text tiles in bytes, step doubts on passed runs, connection chips, midnight UTC, connections vs servers, a person's mark vs the check, security jargon, Try it low on phones, the change placeholder, the native password bubble, the invitation's second Join, value labels on charts, the "[e2e]" tag steering the agent, the plan after a heal | recommendations put to him | minor | main | fixed (his "go with what you recommend": fix-calls-engine, fix-calls-home, fix-calls-account; tests, screenshots; a live chart run used labels and the unit) |

Deployed 07156f7 on 2026-09-24 after check 2038, integration 253, e2e 137 plus invite-only 8. The additive statements ran
on production first (automations.last_skipped_at/_reason, member_org_user_uidx, connections_ws_key, model_spend). The
smoke was green (health names 07156f7), and qa-live walked the signed-out pages read-only at 1280 and 390 in both themes:
the new CSP broke nothing (no console errors, pages hydrate), cron answers a plain 404, the run routes answer 401.

Deployed after the recommendations round: check 2109, integration 255, e2e 150 plus invite-only 8. The e2e clean-ups now
delete the model spend metered against their runs (a paid draft had pushed the demo workspace's day over its budget).

### Round: page-to-page speed (2026-09-24, "the app feels very slow ... moving from page to page")

| id | source | observed | expected | severity | owner | status |
|---|---|---|---|---|---|---|
| Q269 | him | page changes feel slow: Home and Settings showed nothing until the server answered, Settings cost two requests (a redirect), every request began with three queries in a row, a run page and an automation page read one thing after another | a click changes the screen at once; fewer round trips | major | fix-perf | fixed (loading shapes and pending marks, the session with its user in one query, a run in one request, parallel reads; local production build: round trips 4-8 down to 3 per page; e2e 150) |
| Q270 | fix-perf | cold starts on Vercel (~1 s for a page's first visit; each page route is its own function), Fluid compute already on | measured on the live app | minor | main | open: link prefetch now warms a page's function before the click; a signed-in production measurement needs his own browser |
