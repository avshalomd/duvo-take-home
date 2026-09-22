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
| Q8 | reviewer | after Re-evaluate the panel keeps the polled terminal view; the new verdict never appears until reload | the poll state resets when the server render changes | major | ui | re-check (merged, UX) |
| Q9 | reviewer | the duplicate check counts blank URLs, so one row without a URL fails the whole verdict | blank URLs are ignored or keyed on content | minor | eval | fixed (tests + two real local runs by the fix agent) |
| Q10 | reviewer | reevaluate/setConnectionEnabled actions pass ids unvalidated; Re-evaluate on a running run writes a mid-run verdict | z.uuid()/z.boolean() in the actions; re-evaluate only a terminal run | minor | ui | re-check (merged, UX) |
| Q11 | qa-ux | at 390 px the page lays out at 729 px; the Run button is off-screen | fits 390 px (`min-w-0` on the grid children, `overflow-x-auto` on mono blocks) | major | ui | fixed (qa-ux re-walk: scrollWidth 390) |
| Q12 | qa-ux | the run panel is titled by its raw UUID | the instruction's first line as the title, the id small | minor | ui | fixed |
| Q13 | qa-ux | a failed run shows the SDK's raw error text | one plain sentence, the technical text folded | minor | ui | half: fixed in the panel, raw text still repeated twice inside Details |
| Q14 | qa-ux | the final report is printed three times (text event, finished line, REPORT) | the finished line is one line: status, duration, cost | minor | ui | fixing |
| Q15 | qa-ux | the report shows raw markdown | rendered or stripped markdown | minor | ui | fixing |
| Q16 | qa-ux | raw `mcp__deepwiki__read_wiki_structure` in Tools used and in a verdict check | the toolLabel helper used everywhere | minor | ui | fixing |
| Q17 | qa-ux | "Connections: deepwiki connected, unused" reads as contradictory | "DeepWiki - connected, not used by this run" | minor | ui | fixing |
| Q18 | qa-ux | the raw enum `not_configured` on the GitHub row while its switch is on | "needs a token" and a warning that it does nothing until then | minor | ui | fixing |
| Q19 | qa-ux | plan steps as `[x] [.] [ ]` in mono; `[x]` reads as failed | check / dot / empty circle icons | minor | ui | half: hero fixed, Details timeline/plan still [x] |
| Q20 | qa-ux | timeline clock times in UTC with no label | local time or a UTC label | minor | ui | fixing |
| Q21 | qa-ux | runs list rows have no date or relative time | "12 min ago" beside the duration | minor | ui | fixing |
| Q22 | qa-ux | cost and duration merged in one row, no tabular figures | two rows, tabular-nums | minor | ui | fixing |
| Q23 | qa-ux | the judgment percentages are unexplained | "checked by a second model: 90% confident it answered the query" | minor | ui | fixing |
| Q24 | qa-ux | add-a-server errors are fragments, not tied to inputs, focus lost | full sentences, aria-describedby, focus on the first error | minor | ui | fixing |
| Q25 | qa-ux | "No run selected" ignores the runs list beside it; "not found" offers no way back | "Pick a run on the left, or write instructions and press Run." | minor | ui | half: wording fixed but unreachable; not-found offers no way back |
| Q26 | qa-ux | the product is called "App" in the header and the tab | a real name | minor | main | fixed |
| Q27 | qa-ux | the amber "running" badge is at 4.6:1 contrast at 10 px | amber-800 at that size | minor | ui | fixed |
| Q28 | qa-ux | a failed run at turn 0 shows "turn 0 of 25" and an enabled Re-evaluate | the counter hidden at turn 0, Re-evaluate disabled with nothing to judge | minor | ui | half: button disabled, State still says turn 0 of 25 |
| Q29 | qa-func | the agent's init tool list includes host tools (CronCreate, SendMessage, Workflow, ToolSearch...) beyond the four native ones | only WebSearch, WebFetch, Read, Write, mcp__plan__*, mcp__<connection>__* | major | engine | fixed (SDK `tools` option; init lists only Read, WebFetch, WebSearch, Write, mcp__plan__*) |
| Q30 | qa-func | three runs from before the Vercel fix stay "queued" for ever in the list | terminal status with a reason | major | main | fixed (rows closed as failed with the reason) |
| Q31 | qa-func | AI_SIMULATE_DOWN does not reach decide(), so "judge unavailable" is unreachable in QA | the switch fails the judge too | minor | main | fixed |
| Q32 | qa-func | the SDK's own ToolSearch call precedes the plan and is counted in Tools used | ToolSearch hidden from tools used and the timeline | minor | engine | fixed (tests + two real local runs by the fix agent) |
| Q33 | qa-func | the state's turn counter (tool calls) disagrees with the SDK's num_turns | the turn shown is the one the cap applies to | minor | engine | fixed (tests + two real local runs by the fix agent) |
| Q34 | qa-func | the review's reasoning is rendered twice in the verdict | once | minor | ui | fixing |
| Q35 | qa-func | Run again and Re-evaluate active while the run is running | disabled until terminal | minor | ui | fixed |
| Q36 | qa-func | an empty or 5-character instruction is refused with no visible message | a rendered field error | minor | ui | fixed |
| Q37 | qa-func | a terminal run without a plan says "has not said how it read the instructions yet" | "the agent never stated a plan" on a finished run | minor | ui | half: stepper fixed, Details > Intent still says "not yet" |
| Q38 | qa-ux | the panel header is `sticky top-14` inside an `overflow-hidden` wrapper: it covers the 56 px beneath it at every scroll position (the progress bar; on a failed run the whole explanation) | the block under the header fully visible (drop overflow-hidden or the sticky) | major | ui | fixing |
| Q39 | qa-ux | the report prints raw markdown in the overview | rendered with markdown.ts | minor | ui | fixing |
| Q40 | qa-ux | runs list says "succeeded/failed" while the panel says "Done - looks good / Something went wrong" | one vocabulary | minor | ui | fixing |
| Q41 | qa-ux | connections rows show "needs-auth" and hosts in mono | "needs a token before a run can use it" | minor | ui | fixing |
| Q42 | qa-ux | Details > State shows raw mcp__ tool names | toolLabel | minor | ui | fixing |
| Q43 | qa-ux | Details > Verdict says "Not evaluated - the evaluator runs when the agent finishes" on a finished run | "This run was not judged." | minor | ui | fixing |
| Q44 | qa-ux | add-a-server errors are fragments; focus stays on body after a failed submit | full sentences, focus the first bad field | minor | ui | fixing |
