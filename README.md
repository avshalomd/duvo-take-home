# Automations

An agentic automation platform: brief an agent in free text, watch it plan and work step by step, download the
files it wrote, connect it to your own data through MCP servers, and get an automatic verdict on the result.

**Live:** https://duvo-take-home.vercel.app

**Versions.** `v1.0.0` is exactly what existed at the end of the one-hour timed build (the git history shows how it
got there). `v1.1.0` is after about 30 more minutes of polish and bug fixing: the glance view for non-technical
users, live runs working on Vercel, and a hardened run loop (tool allowlist, path guard, wall clock, runs always
closed with a reason). Everything is deployed and works end to end on the live URL.

## What it does

1. **Free-text instructions.** No presets: the agent reads the instructions itself and states, through a plan
   tool it must call first, what it understood: the intent, the expected outputs, the sources it will use, and
   its steps. It updates each step as it starts and ends.
2. **Step by step.** The side panel shows the plan (done / running / pending), a key-state card derived from the
   trace (status, turn, last tool, tools used, connections used, files, cost, duration) and the full timeline
   of text, tool calls and results, live while the run is running.
3. **Files.** The agent writes only text files (`.txt`, `.md`, `.csv`) into a working directory per run; they are
   copied into the database when it finishes and served as downloads.
4. **Connections.** A list of the user's MCP servers over http (name, URL, optional bearer token), each on or
   off. The agent is given exactly the enabled ones; the run records which servers it had (from the SDK's init
   message) and labels every tool call that went through one.
5. **Evaluation.** Before a run is marked done: code checks on the files (a file exists when asked, a CSV parses,
   no duplicates, non-empty), then a decision model (Jev) answers "answered the query?" and "followed the plan?".
   When it finds the plan was not followed or is unsure, an LLM review decides whether the task is finished and
   whether the response is usable or what must change. The verdict, with reasons, is stored on the run.

## Run it

```bash
npm ci
cp .env.example .env.local   # DATABASE_URL, ANTHROPIC_API_KEY, TYPESAFE_API_KEY (Jev), OPENROUTER_API_KEY (fallback)
npm run db:push && npm run seed
npm run dev
```

`npm run check` runs typecheck, lint and the unit tests. `npm run test:int` runs the database tests.
`EVAL=1 npx dotenv -e .env.local -- vitest run src/lib/eval/evaluate.eval.test.ts` runs the evaluator over the
fixture cases and writes `docs/EVAL.md`.

## Architecture

Next.js 16 (App Router, Server Components for reads, Server Actions for writes), Postgres on Neon through Drizzle,
Zod at every boundary. The agent runtime is the **Claude Agent SDK**: `query()` spawns Claude Code as a subprocess
per run with a working directory per run, the built-in WebSearch / WebFetch / Read / Write tools, an in-process
MCP server for the plan tool, and the enabled connections as http MCP servers. Our code records the message
stream as `run_events` rows and derives everything the UI shows from them. See [docs/CODE-TOUR.md](docs/CODE-TOUR.md)
for a per-file tour and [docs/DESIGN.md](docs/DESIGN.md) for the design.

## Decisions and trade-offs

- **The agent's sandbox.** The SDK's `tools` option leaves the agent exactly Read, WebFetch, WebSearch, Write and the plan tools; a PreToolUse hook refuses any path outside the run's directory; a wall clock of 240 s, 25 turns and $1 end a runaway run and the run always closes with its reason. Connections may only point at public http(s) hosts. At most three runs in flight and five starts per address per ten minutes; without sign-in that is a brake, not a lock (see the roadmap).
- **Dark mode and accessibility.** One palette through `light-dark()`, reduced motion honoured, a live region for the outcome, named landmarks and download links, 40 px controls on phones.
- **QA never touches production.** A separate Neon project is the QA database (`npm run qa:dev`); the live database holds only the curated runs.

- **The plan is data the agent emits, not a summary we infer.** The plan tool makes the agent say where it is;
  the timeline still records every tool call, so a run that skips the tool is still observable.
- **State is derived, never stored.** `deriveState(run, events)` is a pure function, tested on fixtures; the key
  state at any point of a run is the last plan event plus the calls since.
- **A decision model before a writing model.** Jev answers the closed questions cheaply with a probability; the
  LLM review runs only when needed.
- **Text files only, stored in Postgres.** A CSV needs no blob store; visuals are a later step.
- **Connection tokens are stored as entered** and never rendered back. A demo trade-off, noted here.

## Tests

- Unit (`npm run check`, 341 tests): the contracts against fixtures, the SDK message mapper, the derived run state,
  the evaluator's checks and its cascade with the model calls mocked, the UI formatting.
- Integration (`npm run test:int`): the connections store against the real table, cleaning up after itself.
- Evaluator accuracy (`EVAL=1 ...`): 10 of 10 labelled cases, [docs/EVAL.md](docs/EVAL.md).
- End to end (`npx playwright test e2e/flow.spec.ts` against a running app): the page, a finished run with its file
  and verdict, a failed run, validation of the form and of a new connection, re-evaluation.
- Production smoke (`e2e/smoke.spec.ts`, read-only): health with the database and the model, the home page.

## Extras

- **The glance view.** The run is shown the way an office worker reads it: the instruction as the title, the outcome in a sentence ("Done - looks good"), the plan as an animated stepper with a progress bar, what it produced as file cards and prose. Everything technical (the timeline, the state grid, cost, turns, the judge's percentages, ids, raw errors) sits under a Details toggle.
- The timeline groups events under the plan step that was running when they happened, shows each tool call as a card labelled by kind (search, fetch, write, connection) with its result folded to two lines, and renders the agent's own text quietly between them.

## Not done, next

- `reevaluateRun`'s database path has no integration test (the mapping and the cascade do).
- No authentication: anyone with the URL can read runs and start new ones within the rate limits (QA item Q48, roadmap item 6).
- The roadmap, in the order it would be built, is in [docs/ROADMAP.md](docs/ROADMAP.md): a less cluttered UX, a
  settings menu for connections and configuration, editable skills, saving a run as a reusable automation
  (`\audit Acme Ltd`), visibility into how each evaluation was decided, and authentication with prompt-injection
  guardrails.

## Evaluation results

The evaluator over the twelve labelled fixture cases scores 12/12: [docs/EVAL.md](docs/EVAL.md).
