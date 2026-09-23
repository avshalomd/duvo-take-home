# Roadmap

What comes after the hour, in the order it would be built. Nothing here is implemented.

## In short (the list sent with the deliverable)

1. Make the UX less cluttered.
2. Keep the instructions box, the runs and the run summary on one page; move settings (connections, editable
   skills, other configuration) into a separate settings menu.
3. Editable skills: let the user define, externally, a complete automation, an answer format, sub-steps, or any
   other behaviour the agent should have.
4. Save a run as an automation: a reusable template (plan, output format, sources) the user reviews and edits,
   then invokes with a command plus input instead of full instructions, e.g. `/audit Acme Ltd` (a front slash, as in coding agents). Still agentic:
   the plan and the output format are predefined, the work is done by the agent with the input.
5. Better visibility into the evaluation: what each check found, whether Jev decided on its own or delegated to
   the LLM review, and what the review concluded and why.
6. Authentication and guardrails: sign-in with per-user runs, connections and skills; prompt-injection defences
   for an agent that reads the open web and connected services; output guardrails; a budget per user.

The sections below carry the detail.

## 0. A less cluttered UX

The glance view is in; next is fewer boxes on the main page: the connections and the add-a-server form leave the
left column for the settings menu (item 2), the runs list gets grouping by day, and the panel's Details view
becomes a drawer so the main column stays short.

## 1. Skills: user-defined behaviour for the agent (his request, T+42)

Let the user edit and add **skills** externally, without touching the code. A skill is a named document the agent
loads when it applies. Skills can define:

- a complete automation ("weekly AI news digest": the sources, the steps, the output file and its columns);
- a general answer format (how a report is structured, what a CSV always contains);
- sub-steps inside an automation (how to verify a source, how to de-duplicate rows);
- any other behaviour we want the agent to have (tone, limits, which connections to prefer).

Shape: a `skills` table (id, name, trigger description, body in markdown, enabled), edited on a page beside
Connections. At run start the enabled skills are listed to the agent (name + trigger) in the system prompt; the
agent reads a skill's body through a `read_skill` tool on the plan server when it decides one applies, and names
the skills it used in `set_plan.sources`, so the run shows which skills shaped it. The evaluator gets the used
skills too, so "followed the plan" can include "followed the skill". Later: import a skill from a file or a URL,
and a skill that declares the connections it needs.

## 1b. Save a run as an automation (his request, after the hour)

Turn a finished run into a reusable automation: its plan, output format and sources become a template the user
reviews and edits, then invokes with a command plus input instead of full instructions, e.g. `/audit Acme Ltd`.
Still agentic: the plan and the output format are predefined, the agent does the work with the input.

## 1c. Settings out of the main page

The instructions box, the runs and the run summary stay on one page; connections, editable skills and other
configuration move to a settings menu. Less clutter on the page the operator uses every day.

## 1d. Evaluation visibility

Show how a verdict was reached: each check's finding, whether Jev decided alone or delegated to the LLM review,
and what the review concluded and why.

## 1e. Authentication, prompt-injection safeguards and guardrails (his request)

Sign-in and per-user data (runs, connections, skills) before anyone but the operator can reach the app.
Prompt-injection defences for an agent that reads the open web and connected services: fetched content and tool
results treated as data (fenced and labelled in the prompt), a decision-model check on tool inputs that try to
exfiltrate (a URL with secrets, a write outside the run, a connection call the plan did not name), an allowlist of
domains per run, and the existing path guard and tool allowlist kept. Guardrails on outputs: a check that a file
contains no credentials or personal data before it is served, and a budget per user per day.

## 2. Offline evaluation across automations and failure cases (his request, T+47) - important

Today there is one offline eval: the evaluator itself over 10 labelled cases (`docs/EVAL.md`, 10/10). It judges
the judge, not the agent. Needed: a suite of **recorded runs** (real `run_events` captured as fixtures) across
several automations (news to CSV, a connection-backed digest, a question with no file, a multi-file report) and
the failure cases (max turns, budget stop, provider error, a plan the agent abandoned, a file with the wrong
columns, a connection claimed but unused, stale or duplicated rows). Each run labelled with the expected verdict
and the expected plan shape. Run in CI with the model calls replayed from the recording, and live on demand, so a
prompt or model change shows its effect on both the agent's behaviour and the evaluator's verdicts before it
ships. Extend `fixtures/llm-cases.json` into that suite rather than starting a second format.

## 3. Per-turn evaluation

Jev after every agent turn (not only at the end), shown in the timeline, so a run drifting off its plan is
flagged while it can still be stopped.

## 4. More output kinds

Images and charts as artifacts; a file store instead of `files.content` once outputs are not small text.

## 5. Live runs on Vercel, or a worker

The Agent SDK spawns a Claude Code subprocess; if the function limits do not allow it in production, a small
always-on worker takes the run loop and the web app only records and shows.

## 6. Connections with OAuth

Jira, GitHub, Notion through their OAuth flows instead of a pasted token; stdio MCP servers on the worker.
