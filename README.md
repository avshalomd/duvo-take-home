# Automations

An agentic automation platform: brief an agent in free text, watch it plan and work step by step, download the
files it wrote, connect it to your own data through MCP servers, and get an automatic verdict on the result.

**Live:** _pending first deploy_

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

- **The plan is data the agent emits, not a summary we infer.** The plan tool makes the agent say where it is;
  the timeline still records every tool call, so a run that skips the tool is still observable.
- **State is derived, never stored.** `deriveState(run, events)` is a pure function, tested on fixtures; the key
  state at any point of a run is the last plan event plus the calls since.
- **A decision model before a writing model.** Jev answers the closed questions cheaply with a probability; the
  LLM review runs only when needed.
- **Text files only, stored in Postgres.** A CSV needs no blob store; visuals are a later step.
- **Connection tokens are stored as entered** and never rendered back. A demo trade-off, noted here.

## Not done, next

_Updated at the end of the hour._
