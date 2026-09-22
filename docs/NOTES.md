# Library notes

Read from the installed packages on 2026-09-22. `.claude/docs/agent-sdk.md` has the verified `query()` call, the
message stream and the five steps; this file adds only what that one lacks.

## Claude Agent SDK - MCP surface

Not installed yet; read from the bun cache copy `@anthropic-ai/claude-agent-sdk@0.2.70/sdk.d.ts` (agent-sdk.md
verified 0.3.278 - check the installed version). `mcpServers?: Record<string, McpServerConfig>` on `Options`:

```ts
{ type: "http", url, headers? }  { type: "sse", url, headers? }      // DeepWiki, GitHub
{ command, args?, env? }         // stdio, no `type` field
{ type: "sdk", name, instance }  // createSdkMcpServer(), in-process, no subprocess and no credentials:

const files = createSdkMcpServer({ name: "files", version: "1.0.0", tools: [
  tool("list_files", "List the files in the workspace", { dir: z.string() },
    async ({ dir }) => ({ content: [{ type: "text", text: (await readdir(dir)).join("\n") }] })),
]});
query({ prompt, options: { mcpServers: enabled ? { files } : {}, allowedTools: ["mcp__files__*"] } });
```

- `tool(name, description, inputSchemaShape, handler)` takes a **raw Zod shape** (`{ dir: z.string() }`), not
  `z.object({...})`, and the handler returns MCP `CallToolResult`: `{ content: [{ type: "text", text }] }`.
- Tool names reaching the model are `mcp__<serverKey>__<toolName>`; the server key is the `mcpServers` record key,
  not the `name` passed to `createSdkMcpServer`. `allowedTools` accepts the prefix wildcard `mcp__files__*`.
- Gotcha: an SDK server whose tool takes over 60 s needs `CLAUDE_CODE_STREAM_CLOSE_TIMEOUT` raised (sdk.d.ts).
- Gotcha: `McpSdkServerConfigWithInstance` is not serializable, so the toggle must rebuild the object per run
  rather than storing it; persist only `{ id, enabled }` and map id -> config in code.
- Connection status for the UI comes from the `system`/`init` message's `mcp_servers[{ name, status }]`; a bad URL
  shows up there as a failed status, not as a thrown error. Show that, not "connected" optimism.
- `outputFormat: { type: "json_schema", schema: Record<string, unknown> }` (a plain JSON Schema object, not a Zod
  schema - use `z.toJSONSchema(...)`); the answer lands on the result message as `structured_output?: unknown`, so
  parse it with Zod before use. Retries exhausted = `subtype: "error_max_structured_output_retries"`.

## Next 16 - streamed route handler (SSE)

```ts
export const runtime = "nodejs";   // the SDK spawns a subprocess; never the edge runtime
export const maxDuration = 300;    // route-segment config; also caps after()
export async function GET() {
  const enc = new TextEncoder();
  const stream = new ReadableStream({ start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ kind: "started" })}\n\n`)); c.close(); } });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
```

Gotcha: a proxy buffers SSE without `no-transform`. Simpler, and what agent-sdk.md assumes: poll
`/api/runs/[id]/events?after=<seq>` every 2 s and skip SSE. Choose one; do not build both.

## Next 16 - file download, and work that outlives the response

```ts
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;                 // params is a Promise in Next 15+; a sync read type-errors
  const row = await getArtifact(id, name);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(row.content, { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"` } });   // quote it or a space breaks the header
}

import { after } from "next/server";                 // POST /api/runs
after(async () => { for await (const m of query({...})) await recordEvent(run.id, m); });
return Response.json({ id: run.id });                // returns at once; the loop keeps going
```

Gotcha: `after()` runs inside the route's `maxDuration`, so set it (300) or the loop is killed at the default.
`next.config.ts` needs `serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"]`.

## Server Action with Zod 4

```ts
"use server";
const Schema = z.object({ prompt: z.string().min(10, "Say what the agent should do"), connectionId: z.string().nullable() });
export async function startRun(_prev: unknown, form: FormData) {
  const parsed = Schema.safeParse({ prompt: form.get("prompt"), connectionId: form.get("connectionId") || null });
  if (!parsed.success) return { values: { prompt: String(form.get("prompt") ?? "") }, errors: z.flattenError(parsed.error).fieldErrors };
  redirect(`/runs/${(await createRun(parsed.data)).id}`);   // redirect() throws - call it outside try
}
```

Gotcha: Zod 4 renamed `error.flatten()` to `z.flattenError(error)`. React 19 clears the form after the action, so
return `values` and render them as `defaultValue` with `useActionState` (CLAUDE.md's forms rule).

## Drizzle with jsonb

```ts
export const runEvents = pgTable("run_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull(),
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(),                                  // started | text | tool_call | tool_result | finished
  payload: jsonb("payload").$type<RunEventPayload>().notNull(),  // $type is compile-time only - validate on read
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("run_events_run_seq").on(t.runId, t.seq)]);     // callback returns an ARRAY in drizzle 0.45

const [row] = await db.insert(runEvents).values({ ... }).returning({ id: runEvents.id });
const rows = await db.select().from(runEvents).where(and(eq(runEvents.runId, id), gt(runEvents.seq, after))).orderBy(runEvents.seq);
```

Gotchas: `jsonb()` stores the object as given - do not `JSON.stringify` it first or you get a JSON string.
`$type<T>()` is a cast, so a row written by an older shape still type-checks; parse with Zod at the boundary.
Keep schema changes additive (CLAUDE.md) so `db:push` never prompts.

## Fixtures

- `runs.json` - 5 runs with full event sequences, shaped like the mapper in agent-sdk.md: a succeeded AI-news run
  (WebSearch, WebFetch, Write, CSV artifact, passing evaluation), a succeeded MCP run (`mcp__deepwiki__*` calls,
  connected server in the init event), one still running (no `finished` event - drives the live view), one failed
  at `error_max_turns` with real tool errors, one that answers in text with no artifact.
- `ai-news.csv` - the good run's artifact: 10 rows (title, source, url, published_at, summary), 15-21 Sep 2026,
  named outlets, no duplicates. Also the `eval_good` input and the seed for the download route.
- `prompts.json` - 6 instructions: the task's news-to-CSV prompt (specific and vague), the MCP repo-digest prompt,
  a second web prompt, a question with no artifact, an off-limits one.
- `connections.json` - 3 MCP connections with `enabled`/`last_status`: DeepWiki (http, no credentials, the demo
  default), GitHub read-only (needs `GITHUB_TOKEN`, shipped disabled), an in-process `sdk` server as the fallback.
- `llm-cases.json` - 10 evaluation cases: clean pass; empty CSV; wrong columns; stale dates (2024 news recited
  from memory - passes every structural check); duplicate URLs padding 4 stories into 8 rows; nine well-formed
  rows of non-AI news (only the judge catches it); an ambiguous mixed bag that should pass *with a note*; no
  artifact at all (short-circuit, no model call, quote the provider error); a malformed CSV (unterminated quote);
  and a run that ignored the enabled connection (checked from the events, not the model's word).
