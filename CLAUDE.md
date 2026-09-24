# Handover

An agentic automation platform for everyday office work. A person says what needs doing in plain words; an agent (the
Claude Agent SDK, one subprocess per run) plans it and works through it; the result is checked before it is called
done; and a run that went well becomes a tested, approved command such as `/news-digest AI`. Live at
https://handover-gold.vercel.app, repo https://github.com/avshalomd/handover. It began as a timed take-home (tag
`v1.1.0`); `v2.0.0` onward is the product. `README.md` is the overview; `docs/CODE-TOUR.md` says what every file does
and why it is built that way; `docs/QA.md` is the log of every finding and its fix.

## Stack

| piece | why it is here |
|---|---|
| Next.js 16 App Router, React 19, TypeScript strict | one codebase for UI and server; Server Components read, Server Actions write |
| Tailwind v4 + shadcn/ui on Base UI (`src/components/ui`) | components copied into the repo, plain to read; the look is `docs/DESIGN-V2.md` |
| Postgres on Neon via Drizzle (`src/db/schema.ts`) | typed SQL close to the SQL itself; the schema is one readable file |
| Better Auth with organizations | sign-in, workspaces (its organizations), roles, invitations |
| Zod 4 | one validation at every boundary: forms, actions, routes, model output |
| Claude Agent SDK | each run's agent; how it is called and what it streams: `.claude/docs/agent-sdk.md` |
| Vercel AI SDK 7 and the templates in `src/lib/llm/` | `extract()`, `runAgent()`, `decide()`; which model for what: `.claude/docs/models.md` |
| Vitest, Playwright | logic tests without a network, database integration tests, end-to-end flows |
| Vercel, project `handover`, region fra1 | production; the database is in the same region |

## Commands

| what | command |
|---|---|
| dev server | the desktop preview, `preview_start` name `app` (`.claude/launch.json`, port 3000); never `npm run dev` from Bash, it takes the preview's port |
| fast gate | `npm run check` (typecheck, lint, unit tests) |
| integration tests | `npm run test:int` (the local database; each test deletes what it creates) |
| end to end | `npx playwright test` against :3000; invite-only sign-up needs a server with `SIGNUP_MODE=invite` (see the header of `e2e/auth-invite-only.spec.ts`) |
| schema to the local database | `npm run db:push` |
| SQL, local / production | `npm run sql -- "<statement>"` / `node .claude/scripts/handover-db.mjs npm run sql -- "<statement>"` |
| deploy | `.claude/scripts/deploy.sh`: deploys the committed HEAD to production with the Vercel CLI and runs the read-only smoke. Deploys are manual: the Vercel project is not connected to GitHub, and `vercel.json` turns Git deploys off |
| production settings | `node .claude/scripts/handover-env.mjs NAME=value`; a secret: he runs `.claude/scripts/set-secret.sh NAME` in his own terminal |

## Environments

- **Local:** `.env.local`. Its `DATABASE_URL` is the QA database, a separate Neon project, never production
  (`.claude/scripts/v2-env.mjs` switches it; `--restore` undoes).
- **Production:** the Vercel project `handover` and its own database. `.vercel/.env.production.local` (from
  `vercel pull --yes --environment production`, git-ignored) is what `handover-db.mjs` reads. `RUNNER=route`: each run
  executes in `/api/runner/<id>`, the only function that carries the agent's Linux binary (`next.config.ts`).
- Handover is the only Vercel project of this repo; v1's (`duvo-take-home`) and the rehearsal projects are deleted.

## Production rules

- **Production is a showroom.** QA against it is read-only: pages and GET requests. Anything that writes (runs,
  connections, test users) happens locally, and whatever a test creates is named `[e2e] ...` or `e2e-...` and deleted.
- **Schema changes are additive** (new tables, nullable or defaulted columns) and reach production **before** the code
  that needs them, as plain statements through `handover-db.mjs`. Not `db:push --force` against production: it syncs
  the whole schema and drops what it does not know.
- **After every deploy** `/api/health?deep=1` is green (database and model) and names the deployed commit; sign-in
  answers and a signed-out visit is sent to it.

## Code rules

- **Tests first.** Each test is named by the behaviour it pins, and is committed as `test: ...` before the
  `feat:`/`fix:` that makes it pass.
- **Plain, explicit code** over clever code; small files with one job; no abstraction or dependency the work does not
  need. The reason for each non-obvious decision is a one-line comment beside it. `docs/CODE-TOUR.md` grows with
  every change worth explaining.
- **Server-first.** Server Components read, Server Actions write (Zod inside the action), route handlers only for
  what a client or a third party calls, `"use client"` only where there is interaction. Every action and route checks
  the session, scopes every read and write by the session's workspace, and checks the caller's role on the server.
- **Model calls are product code**, on the three templates in `src/lib/llm/`: `extract()` for one structured call,
  `runAgent()` for a tool loop, `decide()` for a closed judgment (a repeated yes/no, choice or score belongs there, not
  in a prompt). Prompts live in one module each; failures are visible and retryable in the UI; the output is stored
  with the input that produced it.
- **For office workers.** Plain words on every screen; ids, tool names, costs, raw errors and other technical detail
  only behind Details.
- **Verified or not done:** `npm run check`, then the flow in a browser or with `curl`.
- **An implausible measurement is a bug in the measurement.** A capable model scoring zero or every case failing at
  once: read the full error body before believing it (a 429 and an unsupported parameter look alike).

## Patterns that bit

- **Atomic writes:** `transaction(async (tx) => ...)` from `@/db` (the WebSocket pool). The default `db` is Neon's
  HTTP driver and cannot hold an interactive transaction. Races between requests are closed with a
  `pg_advisory_xact_lock` inside the transaction (run starts, member changes).
- **Forms:** React 19 resets a form after its action runs. For more than two fields use `useActionState` and return
  the submitted values with the errors.
- **Seed:** `scripts/seed.ts` builds its own client because `@/db` is server-only.
- **Is the model working?** `/api/health?deep=1` makes one tiny model call (cached a minute). Believe its warning.
  `extract()` asks Claude Sonnet on Anthropic first and an OpenRouter model second (`.claude/docs/models.md`);
  `AI_MODEL` and `AI_MODEL_FALLBACK` switch either in one variable; `AI_SIMULATE_DOWN=1` walks the model-down path.
- **Next 16:** a `loading.tsx` streams the page before `notFound()` runs, so a missing record answers 200: use
  `<Suspense>` inside pages that can 404. `error.tsx` receives `{ error, retry }`.

## Git and secrets

- Small commits with conventional messages, pushed to `main` (a push does not deploy). Stage named paths.
  `.claude/worktrees/` and `.claude/run/` are ignored.
- Never commit or print a secret: no `cat` of env files, no echo of keys; check a variable by name only
  (`grep -c '^NAME=' .env.local`). `.claude/hooks/guard-secrets.sh` blocks the common slips.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
