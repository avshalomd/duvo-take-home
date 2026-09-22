# Roadmap

What comes after the hour, in the order it would be built. Nothing here is implemented.

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

## 2. Per-turn evaluation

Jev after every agent turn (not only at the end), shown in the timeline, so a run drifting off its plan is
flagged while it can still be stopped.

## 3. More output kinds

Images and charts as artifacts; a file store instead of `files.content` once outputs are not small text.

## 4. Live runs on Vercel, or a worker

The Agent SDK spawns a Claude Code subprocess; if the function limits do not allow it in production, a small
always-on worker takes the run loop and the web app only records and shows.

## 5. Connections with OAuth

Jira, GitHub, Notion through their OAuth flows instead of a pasted token; stdio MCP servers on the worker.
