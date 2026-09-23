# QA

## R3 - the merged app on :3000 (T+45 to T+48, orchestrator's walk)

| # | severity | finding | owner | status |
|---|---|---|---|---|
| 1 | - | Live run from the form: succeeded in 1 min 29 s, $0.39; plan of 4 steps with the agent's notes, state card, timeline, output.csv downloadable (attachment header), verdict pass with 7 checks and Jev 0.90 / 0.93 | - | verified |
| 2 | minor | The seeded "running" fixture run never finished, so its panel polled for ever | data | fixed at T+58: the seeded row was deleted from the database |
| 3 | minor | `reevaluateRun`'s two database queries have no integration test | eval | open, listed in the README |

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
| Q48 | qa-edge | no authentication: any visitor reads every run, report and file and starts runs | known for a single-user demo; on the roadmap (1e) | minor | main | open (roadmap) |
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
| Q115 | qa-ux | every page logs "Only plain objects can be passed to Client Components ... Set objects are not supported" in dev | no error | minor | home | open: every page, /sign-in and a 404 included, so from the root layout or the framework (payload m: Set) |
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
| Q133 | qa-func | the rail search does not match a run's command | a match | minor | home | partly fixed: a command run is found, an example run is not (fixing) |
| Q134 | final | a run started from a worktree dev server was given the developer's claude.ai connectors (Gmail, Plane, Docs): the child inherits the parent's environment and connector settings, and permissions are bypassed | a run sees only its workspace's connections: strict MCP config, claude.ai connectors off, an allowlisted child environment, and a guard that blocks any MCP tool not ours or the workspace's | major | engine + guards | guard part fixed (474d81a: any MCP source not ours or the workspace's is blocked); engine part fixing |
| Q135 | final | the composer's text is 14 px on desktop (shadcn's md:text-sm wins) while its hint and the handover copy are 19 px: the brief jumps and rewraps on Run | one size for the box, the hint and the handover | major | home | fixing |
| Q136 | final | thread nodes centred on the whole step (title and note), not the title | nodes beside the title's first line | major | main (thread) | fixed (d7689ae) |
| Q137 | final | the thread is not the memorable element: no thread on the first visit, a thin line under a 34 px four-line title | a heavier thread (d7689ae), the title at most two lines, a quiet thread on the first visit | major | home + main | fixing |
| Q138 | final | the handover: 1.1 s of nothing after Run, two differently wrapped copies cross-fading, then 5 s of "reading your brief" with no thread | the move starts on the press and lands on a thread with its first bead | major | home | fixing |
| Q139 | final | the Automations gallery is the most default-looking screen: the command breaks at its hyphen, no press feedback | built around the command token and a mini thread; the command never breaks | minor | automations | fixed (78b53be) |
| Q140 | final | hovering a rail row squeezes its title to two characters | the title stays readable | minor | home | fixing |
| Q141 | final | charts are white slabs in dark mode | charts that follow the theme | minor | outputs | fixed (0b449ee: transparent, a style block with a dark-scheme twin; da4ceec: date axes) |
| Q142 | final | a chart is labelled "contains 2 payment card numbers" (long decimals pass the card check) | no card warning on decimals or charts | minor | guards | fixed (474d81a: no card inside a decimal; charts skip phone/card/IBAN counts; hand-written .svg/.xlsx refused) |
| Q143 | final | press feedback missing on rail rows, New run, top-bar links, Why?, gallery tiles; no focus ring on the composer capsule | the same press feedback and a visible focus everywhere | minor | home + automations | fixing |
| Q144 | final | inline code in the report is monospace; some reports show "Report" twice | no monospace in the glance view; one heading | minor | home | fixing |
| Q145 | final | page titles differ (34, 40, 44 px) and every display size has the same tracking | one page-title size, tracking by size | minor | main + owners | fixing (utilities in d7689ae) |
| Q146 | final | a focused row in the Add a server dialog draws a square ring over the group's rounded corners | the ring follows the shape | minor | settings | fixed (ca8a6cf) |
| Q147 | final | connection names under the composer run together ("DeepWiki e2e Settings moved"); a settings e2e leaves a connection and invitations behind | separated names; tests clean up | minor | home + settings | settings part fixed (c4ecb04: the spec cleans up even when a test fails); composer chips with home |
