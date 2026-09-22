# Requirements

Goal: an agentic automation platform - send instructions to an agent, watch it work step by step, take the file it
produced, connect it to your data through an MCP server, and have the result evaluated automatically.

## The task's world

An operator hands a job to an agent the way they would brief a junior colleague: one set of instructions, then
they get on with something else. The agent (Claude Agent SDK: a Claude Code subprocess running the tool loop)
searches the web, reads files, calls connected services, writes files, and comes back with an answer. Automations
here are long, many-step processes (Zapier, n8n, Lindy, Relay all show a run as a step trace), so the operator
must be able to look at a run at any moment and know where it is and what it has done. The objects: a **run**
(instructions in, a trace of steps, a final answer), its **artifacts** (files the agent wrote, here a CSV), the
**connections** it may use (MCP servers, each on or off), and a **verdict** (did it succeed). The decision the
operator makes is whether to trust the output and use it. Getting it wrong costs: a plausible but stale or empty
CSV goes into someone's report; a runaway agent burns money; an agent reading a connection the operator switched
off is a data leak.

## Stated

- R1 A lightweight frontend: send one set of instructions to an agentic system and get a response back. Claude Agent SDK recommended (Anthropic key provided).
- R2 A task prompt, "Fetch the latest AI news from the web and save them into a CSV"; the user can get a copy of the output file.
- R3 A view to observe the automation as it unfolds, step by step; automations have many steps; at every point the key state of the automation can be derived.
- R4 "Connecting your data": an MCP server of our choice; the agent runs an automation with it; it is clear the agent is using the connection; the user can enable/disable it.
- R5 When the agent completes, evaluate automatically whether it succeeded, based on an artifact of our choice.
- R6 Steps in order; at each step the core problem, solved, then move on; trade look, capability and architecture for the best overall result.

## Implied

- I1 Runs are persisted (run, events, artifacts) - the agent runs 30-90 s in a subprocess; the browser can neither hold the request nor be the only copy of the trace.
- I2 A failed or runaway run shows its reason (max turns, budget, provider error) and the user can start another - the SDK's `result.subtype` names the cause.
- I3 The key state is derived from the events, not stored beside them: status, turn n of max, last tool and its input, tools used, connections in use, artifacts so far, cost and duration - one derivation, testable without a model.
- I4 The connection toggle is enforced at the run, not painted on: the MCP server is passed to the agent only when enabled, and the run records which connections the agent actually had (the SDK's init message) - the badge is evidence.
- I5 Safety and cost caps on every run (max turns, max budget, no shell, no edits, a working directory per run) - the agent runs with permissions bypassed.
- I6 The verdict is stored with its reasons and the artifact it judged, so pass or fail can be defended on the call.
- I7 A one-click preset for the AI-news task and a runs list of past runs, seeded from fixtures, so every screen demos even when the model is down.
- I8 One page (his correction, T+5): the instructions box and the agent's response are the main interaction; the step timeline and the key state card are a side panel on that same page, opened for the current run, not a separate route.

- I9 (his idea, T+8) A plan tool: the agent must call out every step it will take, then mark each step done and the step it is on as it goes - the key state comes from the agent's own plan (done, current, pending), not only from inferred tool calls. An in-process MCP tool (`set_plan`, `update_step`), enforced by the system prompt; the state card renders it.


## His framing (T+10, replaces the step-by-step reading above where they differ)

- A **generic automation agent**: native abilities are searching the web, reading pages and writing text files. It gets one query and always reports where it is in the automation (the plan tool, I9).
- A run ends either with a report of what it did and what it could not do, or with an explanation plus **downloadable files, text only for now: .txt, .md, .csv** (visuals later).
- **Connections are the user's own MCP servers** (Jira, GitHub, any non-trivial data source), enabled or disabled per connection; the agent uses only the enabled ones and the run shows which it used. The hour ships the mechanism with one or two seeded servers; adding any http MCP by URL is the generic form.
- The evaluator is therefore generic: it judges the run's outputs (final report and files) against the instructions, with per-file-type code checks (a CSV parses, files non-empty) before the model judgment.

## Open questions

- Q1 Live URL: the SDK spawns a ~270 MB Claude Code binary; Vercel's function package cap is now 5 GB on Fluid Compute, unverified for this SDK. - default: deploy the app and the stored runs to Vercel, try one live run there; if the agent cannot spawn there, live runs are local-only and the README says so.
- Q2 Which connection for R4? - default: GitHub MCP, read-only (repos, issues), the automation "list the open issues of <repo> into a CSV"; token via `set-secret.sh GITHUB_TOKEN`. Fallback with no token: DeepWiki MCP (public, no auth).
- Q3 What does the evaluator judge? - default: the CSV artifact. Code checks first (parses, required columns, 5+ rows, valid URLs, dates within 7 days, no duplicate URLs), then the decision model (`decide()`) on the closed questions (rows on topic, run complete); verdict pass/fail with reasons, shown on the run.
- Q4 Agent model and backend? - default: `claude-sonnet-5` with the Anthropic key; OpenRouter as the Anthropic-compatible fallback.

## Scope (aligned, T+13; size A picked at the design gate, T+26)

- Size A: packages engine, ui, eval, connections - the Must core. Free text only, no presets (T+24); the evaluator cascades from Jev to an LLM review (T+24).

- Must: R1, R2, R3, R4, R5, I1, I2, I3, I4, I5, I9 - a generic agent (web search, read, write .txt/.md/.csv), one page with the run side panel, the plan tool as the source of "where it is", connections as a list of the user's http MCP servers (seeded, on/off, enforced at the run), files downloadable, and the evaluator as the run's last step before it is marked done.
- Should: I6, I7, a live run on Vercel, token streaming of the assistant text, a per-step evaluator (Jev after every turn of the loop).
- Won't: sign-in and multi-user, scheduled or recurring automations, non-text outputs (visuals), resuming a run, stdio MCP servers, cost dashboards.
- If the build slips: the model judgment goes first (the code checks and the plan-followed check stay), then the "add a connection" form (seeded connections keep their switches).

## Assumptions

- "Turn" in his evaluator answer means one automation run: the evaluator runs once, when the agent finishes, before the run is marked done. A per-step evaluator is a Should.
- The agent decides the output format from the instructions ("save as CSV"); the user does not pick one. Files are restricted to .txt, .md and .csv by the agent's Write tool rules and by what we serve.
- Agent model: `claude-sonnet-5` on the Anthropic key; OpenRouter as the Anthropic-compatible fallback. Native abilities: WebSearch, WebFetch, Read, Write; no Bash, no Edit; cwd per run; max turns and max budget per run.
- No sign-in: one operator. Connection tokens are stored in the database as entered (a demo; the README says so) and never rendered back.
- The run page polls the events every 2 s; no token streaming in the Must tier.
- Connections: the seeded ones are DeepWiki (no auth) and GitHub read-only when `GITHUB_TOKEN` is set. Only http/sse MCP servers; stdio servers need a command on the host and are out.

## Design choices

- **One page** (his call, T+5). Left: instructions box, the AI-news preset, the connections with their switches, past runs. Right, a side panel for the selected run: the plan (done / current / pending) and key state card on top, the step timeline below, the end report, files and the verdict at the bottom.
- **Connections** (T+12): a list of the user's http MCP servers, name + URL + optional token, on/off; seeded; the agent gets every enabled one; the run records which it had (init message) and which it used (tool calls).
- **Evaluator** (T+12, his words): "at the end of every turn, before we mark it as done, a real-time evaluator: Jev checks that the agent answered the user query and followed the plan." Code checks on the files first (parse per type, non-empty, exist when asked), then `decide()` with the instructions, the plan and the report: answered the query? followed the plan? Verdict with reasons on the run.
- **Live URL** (T+12): deploy everything; the first deploy tries a live run on Vercel; if the SDK cannot spawn there, live runs are local-only and the README says so.

## Changes during the hour

- T+24 free text only, no presets; the plan tool carries intent, expected outputs and sources.
- T+24 the evaluator cascades from Jev to an LLM review when the plan was not followed or Jev is unsure.
- T+42 roadmap: user-defined skills (docs/ROADMAP.md).
- T+43 the last deploy moved to T+55; feedback comes on the go.
- T+47 a better timeline visualization (asked, routed to the UI package, may not land); offline evaluation across automations and failure cases on the roadmap as important.
