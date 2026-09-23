# Automations

An agentic automation platform for everyday office work: say what needs doing in plain words, watch an agent plan
it and work through it, take the files it made, and turn a run that went well into a tested, reusable command.

**Live:** https://duvo-take-home.vercel.app runs **v1.1.0** (the take-home as delivered). **This branch is v2**,
built and tested locally; it is not deployed.

## What it does (v2)

1. **Sign in** with email and password (Google when configured). Everyone gets a personal workspace; runs,
   connections and automations belong to a workspace, and members can be invited by link.
2. **Home**: one box, "What should the agent do?". The agent states its plan first, then works through it; the plan
   is drawn as a single line that fills as steps finish. The outcome is one sentence, with **Why?** explaining how
   the verdict was reached; **Stop** ends a run, **Ask for a change** continues it; everything technical (the
   timeline, tool calls, costs, probabilities) is in **Details**.
3. **Outputs**: text files (.txt, .md, .csv), charts (.svg) and spreadsheets (.xlsx). The agent passes data to the
   chart and spreadsheet tools; our code renders the files. Files are scanned: credentials hold a file back until
   you confirm, personal data is counted and shown.
4. **Automations, built from a run**: pick a run that went well, press **Make an automation**, and a model drafts a
   template (instructions with an `{input}`, what it produces, its steps, the connections it needs). You edit it,
   run one or two examples, judge each one (looks right / not right), and approve it. Then `/audit Apple Inc.` in
   the Home box runs it. Any edit to an approved automation sends it back to draft until a new example is approved.
   Automations can run on a schedule, in your own time zone.
5. **Connections**: the workspace's MCP servers over http, with no sign-in, a token (encrypted at rest), or OAuth
   (discovery, dynamic client registration, PKCE). The agent gets exactly the connections that are on.
6. **Evaluation**: before a run is marked done, code checks the files (per kind: CSV structure, chart well-formed,
   workbook valid, freshness, duplicates, the automation's template kept), then a decision model (Jev) answers
   three questions: did it answer the instructions, did it follow its plan, did it act only on your instructions
   and not on text it read. Doubt goes to an LLM review. Every finished step is also checked as the run goes.
7. **Guardrails**: the agent is told that pages and connection results are data, never instructions. Guards on
   every tool call block private addresses and blocked sites, ask the decision model about addresses that could
   carry data out (in the query, the path or a subdomain), refuse writing credentials, and flag connections the
   plan did not name. Each workspace has a daily budget, a run limit and a cap on runs in progress.

## Run it

```bash
npm ci
cp .env.example .env.local   # DATABASE_URL, ANTHROPIC_API_KEY, TYPESAFE_API_KEY, BETTER_AUTH_SECRET, CONNECTION_KEY
npm run db:push && npm run seed   # the seed adds demo@example.com / demo-password (local only)
npm run dev
```

- `npm run worker` runs queued runs and schedules when `RUNNER=queue` (no function time limit).
- `npm run check` runs typecheck, lint and the unit tests; `npm run test:int` the database tests;
  `npx playwright test` the end-to-end suite (it signs in as the demo user).
- `EVAL=1 npx dotenv -e .env.local -- npx vitest run src/lib/eval/suite.eval.test.ts` runs the evaluator over
  the recorded runs with the live judge and writes `docs/EVAL.md`.

## Architecture

Next.js 16 (App Router, Server Components for reads, Server Actions for writes), Postgres on Neon through Drizzle,
Better Auth for sign-in and workspaces, Zod at every boundary. The agent is the **Claude Agent SDK**: one Claude
Code subprocess per run with its own working directory, the built-in WebSearch / WebFetch / Read / Write tools,
in-process MCP servers for the plan and the output tools, and the workspace's connections. Every message becomes a
`run_events` row; the state on screen is derived from those rows, and the page follows a run over Server-Sent
Events. See [docs/V2-PLAN.md](docs/V2-PLAN.md) for the design, [docs/DESIGN-V2.md](docs/DESIGN-V2.md) for the look
and [docs/CODE-TOUR.md](docs/CODE-TOUR.md) for a per-file tour.

## Decisions and trade-offs

- **No user-written prompt text reaches the agent unless it was tested.** Free-form "skills" were dropped; reusable
  behaviour is an automation, approved only after a person judged a real example of the current version.
- **Commands start with `/`**, as in coding agents.
- **A decision model before a writing model.** Closed judgments (the verdict, each step, a suspicious address) are
  asked of Jev as probabilities; the LLM review runs only on doubt.
- **Tenancy is one column and one filter.** Every query takes the workspace from the session, never from the
  client; another workspace's run reads as "not found".
- **Runs execute inline by default** (as v1, inside the request's time budget); `RUNNER=queue` and the worker lift
  the limit and fire schedules. Follow-ups resume the agent's session where it still exists and always carry a
  summary of the earlier run.

## Tests

- Unit (`npm run check`, 1,250+ tests): contracts, the message mapper, derived state, the evaluator and its
  replayed suite of 18 recorded runs, the guards and scanners, the command parser, templates and approval, schedules
  across daylight saving, crypto, budgets, the UI wording.
- Integration (`npm run test:int`): tenancy, the stores, jobs and recovery, follow-ups, OAuth rows.
- End to end (`npx playwright test`): sign-in and invitations, tenancy by URL, Home, the automation builder,
  Settings.
- Evaluator suite: 18/18 replayed and 18/18 live ([docs/EVAL.md](docs/EVAL.md)).

## Not done

- v2 is not deployed. Schedules on Vercel need a cron that runs every few minutes (the Hobby plan allows one a day);
  locally the worker fires them.
- An OAuth sign-in has been checked up to the provider's page (Linear, Notion, Sentry), not completed.
- A follow-up recorded with `npm run record-run` keeps only its change as the prompt (QA Q88).
- Open QA items are listed in [docs/QA.md](docs/QA.md).
