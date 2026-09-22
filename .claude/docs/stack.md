# The stack

`.claude/scripts/scaffold.sh` lays it into the repo at T+0 from `.claude/scaffold/`, with pinned versions that
were tested together before the task. It is close to Duvo's own stack (TypeScript, Next.js, Postgres). Every
piece is here because he can explain why it is there. Nothing gets added without a reason he could give.

| piece | why it is here |
|---|---|
| Next.js 16 App Router, React 19, TypeScript strict | one codebase for UI and server; Server Components read, Server Actions write |
| Tailwind v4 + shadcn/ui (`src/components/ui`) | components copied into the repo, plain to read, no design detours |
| Postgres on Neon via Drizzle ORM (`src/db/schema.ts`, `src/db/index.ts`) | typed SQL close to the SQL itself; the schema is one readable file |
| Zod 4 | one validation at every boundary: form input, route params, API bodies, LLM output |
| Vercel AI SDK 7 through `getModel()` in `src/lib/ai.ts` | one call shape for any provider; structured output checked against a Zod schema |
| `.claude/docs/models.md` | which model, what it costs, and the failures that look like a bad model and are not |
| `.claude/docs/agent-sdk.md` | **the agent runtime for this task, his decision: the Claude Agent SDK** (Claude Code as a library, a subprocess per run). The verified `query()` call, the message stream and how each of the task's five steps maps onto it; the kit's `agent.ts` loop is not used for the runs |
| `src/lib/llm/extract.ts`, `agent.ts`, `decide.ts` | the three model templates: one structured call, a tool-calling agent loop (AI SDK's `ToolLoopAgent`), and a typed decision (Jev - a model that judges rather than writes); no agent framework, so every line is ours to explain |
| Vitest, Playwright | logic tests without a network; a read-only smoke test against production |
| Vercel CLI, region fra1 | the live URL in one command; the database is in the same region |

## Library notes

- Next 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API you are unsure of.
- AI SDK 7: structured output is `generateText({ model, output: Output.object({ schema }) })`, and the system
  prompt option is `instructions`. Docs are in `node_modules/ai/docs/` (agents: `03-agents/`). `getModel()` picks
  the provider by which key is set (Anthropic, OpenAI, Google, OpenRouter), with the AI Gateway as fallback. The
  bootstrap puts an OpenRouter key in `.env.local` and on Vercel and checks the model answers before T+0.
- **The model templates** (`src/lib/llm/`, each with a mock-model test beside it):
  - `extract({ schema, instructions, input })` - one call at temperature 0, the input fenced as data, a Zod-checked
    object back. Throws `LlmError` with a user-readable message on a timeout, off-schema output or a provider
    failure, carrying the provider's own words (a gateway's `Provider returned error` says nothing). It also
    survives two things that look like a bad model: a model that refuses a JSON schema (400) is asked for JSON in
    the prompt instead and validated against the same schema, and a model that fails outright is retried once on
    `getFallbackModel()`. See `.claude/docs/models.md`.
  - `runAgent({ instructions, tools, prompt })` - a `ToolLoopAgent` with a step cap and a timeout; returns the
    answer and the trace (every tool call with its input and output) so the UI can show what the agent did. A
    tool is one file in `src/lib/llm/tools/`: `tool({ description, inputSchema, execute })`; to connect it, add it
    to the `tools` object passed in. `tools/clock.ts` is the example.
  - `decide({ state, questions })` - a closed judgment answered by Jev, the decision model: `noul()` for a yes/no,
    `choice()` for one of a list, `score()` for a rubric. Every question is answered in ONE request, so ask the
    speculative ones too. `isConfident()` splits the answers that can be acted on from the ones a person should
    see. It writes no text, so there is no parsing and no off-schema failure - the answer is always an option the
    code listed. Three routes (TypeSafe, OpenRouter, the Vercel gateway), paid first, with failover between them. **When it fits
    and when it does not, plus the routes and their dialects:
    `.claude/docs/models.md`.**

## Commands (after the scaffold)

| what | command |
|---|---|
| dev server | the desktop preview, `preview_start` name `app` (`.claude/launch.json`, port 3000), never from Bash; a worktree: `.claude/scripts/wt-serve.sh <tree> <port>`, 3001+ |
| fast gate | `npm run check` (typecheck + lint + unit tests) |
| e2e | `npm run test:e2e` (starts dev if needed); against prod: `BASE_URL=<url> npx playwright test` |
| schema to DB | `npm run db:push` |
| seed | `npm run seed` |
| a SQL statement | `npm run sql -- "<statement>"` |
| deploy + smoke | `.claude/scripts/deploy.sh`, **only when he asks** (the `ship` skill); prints the production URL and writes `.vercel/prod-url` |
| a secret | the human runs `.claude/scripts/set-secret.sh NAME` in his own terminal |

## Patterns that bit in rehearsal

- **Atomic multi-row writes:** `transaction(async (tx) => ...)` from `@/db` (WebSocket pool, real BEGIN/COMMIT).
  The default `db` is the Neon HTTP driver and cannot run an interactive transaction; `db.batch([...])` works for
  a fixed list of statements. Prefer the plain transaction: it is the version you can explain in a review.
- **Forms:** React 19 resets a form after its action runs, which wipes what was typed when validation fails. For
  forms with more than two fields use `useActionState`, return the submitted values with the errors and render
  them as `defaultValue` (or submit through `onSubmit` + `startTransition`).
- **Tests:** unit tests `src/**/*.test.ts` (no network) run in `npm run check`; database integration tests
  `src/**/*.int.test.ts` run with `npm run test:int` and delete what they create.
- **Seed:** `scripts/seed.ts` (`npm run seed`) builds its own client because `@/db` is server-only. Seed enough that
  every screen can be demoed even if the LLM is down.
- **Shared database:** dev and prod use one Neon database. `e2e/smoke.spec.ts` runs against production and stays
  read-only. Flow tests run locally, name everything they create with an `[e2e]` prefix and delete it afterwards,
  so the live demo data stays clean.
- **Schema changes stay additive:** new tables, nullable or defaulted columns. `db:push` then never prompts. A
  rename, or NOT NULL on a table with rows, makes drizzle-kit prompt, and it hangs without a terminal: run the
  statement with `npm run sql -- "<statement>"` and keep `schema.ts` in step.
- **Is the LLM actually working?** `/api/health?deep=1` makes one tiny model call; `deploy.sh` warns when the model
  is configured but not usable. Check it after the first deploy and believe the warning: on 2026-09-20 OpenRouter
  retired the `:free` twin of the default model and every call 404'd in production while local work carried on.
  The default slug is paid for that reason; `AI_MODEL` switches it in one variable, `AI_MODEL_FALLBACK` the
  second model `extract()` tries. **Which model, what it costs, and the three failures that look like a bad model
  and are not: `.claude/docs/models.md`.** A capable model scoring badly is a harness bug until proven otherwise. Off-schema model output throws `NoObjectGeneratedError`; catch it and show a
  failure state. The mock-model test pattern is `src/lib/ai.test.ts`. `AI_SIMULATE_DOWN=1 npm run dev` makes every
  model call fail, so the LLM-down path can be walked in QA.
- **Deploys can stall on Vercel.** `deploy.sh` times out after 180 s, cancels the stuck build (it would block the
  account's only build slot) and retries once with a local build uploaded as `--prebuilt`. Run it in the
  background and keep building. **Deploys are on demand**: nothing deploys on a push (`vercel.json` sets
  `git.deploymentEnabled: false`) and nothing deploys on a timer; the harness offers at the skeleton, midway and
  by T+45, and he says `/ship`. Three in the hour is the sensible number, the last by T+45, not at the buzzer. The README describes only what is live (anything pushed but not deployed is
  labelled so).
- **Next 16:** a `loading.tsx` streams the page before `notFound()` runs, so missing records return 200. Use
  `<Suspense>` inside the page on routes that can 404. In Next 16 `error.tsx` receives `{ error, retry }`,
  not `reset`.
