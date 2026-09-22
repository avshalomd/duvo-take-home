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

## Open questions

- Q1 Live URL: the SDK spawns a ~270 MB Claude Code binary; Vercel's function package cap is now 5 GB on Fluid Compute, unverified for this SDK. - default: deploy the app and the stored runs to Vercel, try one live run there; if the agent cannot spawn there, live runs are local-only and the README says so.
- Q2 Which connection for R4? - default: GitHub MCP, read-only (repos, issues), the automation "list the open issues of <repo> into a CSV"; token via `set-secret.sh GITHUB_TOKEN`. Fallback with no token: DeepWiki MCP (public, no auth).
- Q3 What does the evaluator judge? - default: the CSV artifact. Code checks first (parses, required columns, 5+ rows, valid URLs, dates within 7 days, no duplicate URLs), then the decision model (`decide()`) on the closed questions (rows on topic, run complete); verdict pass/fail with reasons, shown on the run.
- Q4 Agent model and backend? - default: `claude-sonnet-5` with the Anthropic key; OpenRouter as the Anthropic-compatible fallback.

## Scope (first guess)

- Must: R1, R2, R3, R4, R5, I1, I2, I3, I4, I5. If the build slips, R5's model judge goes first (code checks stay), then R4 keeps one connection with the toggle and drops the second.
- Should: I6, I7, Q1's live run on Vercel, token streaming of the assistant text.
- Won't: sign-in and multi-user, scheduled or recurring automations, editing the agent's tools from the UI, resuming a run, more than one connection type, cost dashboards.
