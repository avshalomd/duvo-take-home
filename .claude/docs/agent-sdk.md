# Claude Agent SDK: the agent runtime for this task

Verified on this Mac on 2026-09-22 with `@anthropic-ai/claude-agent-sdk@0.3.278`: a real `query()` run that wrote a
file into its working directory, connected an http MCP server, ran `WebSearch`, and returned a `json_schema`
structured output; and a second run inside a Next 16 route handler (`next dev`, Turbopack, `serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"]`) that spawned the agent and wrote its file. Everything below is from those runs and the package's own `sdk.d.ts`, not from memory.

## What it is

Claude Code as a library. `npm i @anthropic-ai/claude-agent-sdk` (the tarballs are in the npm cache already; it
unpacks to ~270 MB because it carries the Claude Code binary for darwin-arm64). `query({ prompt, options })`
spawns that binary as a child process; the child runs the whole agent loop (model calls, built-in tools, MCP
servers, permissions) and streams messages back. Our code renders and records the messages; it never runs the
loop itself. It runs where a subprocess can run: this laptop, a container. **It does not run on Vercel functions**
(250 MB cap, an open issue in the SDK repo), so the deploy is optional for this task; the README says so.

## The call that works

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt,
  options: {
    cwd: runDir,                       // runs/<id>, gitignored; the agent's files land here
    settingSources: [],                // REQUIRED: the default loads ~/.claude/settings.json AND this repo's
                                       // .claude/settings.json - the clock hooks and the secrets guard would run
                                       // inside the agent. [] = SDK isolation mode.
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,   // required with bypassPermissions
    allowedTools: ["WebSearch", "WebFetch", "Write", "Read"],   // auto-approved; it does NOT restrict
    disallowedTools: ["Bash", "Edit", "Task", "Glob", "Grep", "NotebookEdit"],   // removed from the agent
    maxTurns: 12,
    maxBudgetUsd: 1,
    model: "claude-sonnet-5",          // with ANTHROPIC_API_KEY direct; see Backends
    systemPrompt: "You are an automation agent. Use your tools and never ask questions.",
                                       // a string REPLACES Claude Code's own (large, costly) system prompt;
                                       // { type: "preset", preset: "claude_code", append: "..." } keeps it
    mcpServers: connectionEnabled
      ? { github: { type: "http", url: "https://api.githubcopilot.com/mcp/readonly",
                    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, "X-MCP-Toolsets": "repos,issues" } } }
      : {},
    env: { ...process.env, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY! },   // env REPLACES the child's env
    // outputFormat: { type: "json_schema", schema }   // -> result.structured_output (the eval judge)
  },
});
for await (const m of q) { /* record it, see below */ }
```

Timings measured: `system/init` after 1.6 s; a Write task 13.6 s end to end (2 turns); a WebSearch answer 26 s;
a no-tool judge call 8 s. Cost per run with a plain string system prompt: about $0.03 for a judge call, $0.15 for
a run with the tool list (via OpenRouter Sonnet 4.6; Anthropic direct is the same order).

## The messages, in the order they come

| `type` | what it carries | record as |
|---|---|---|
| `system` / `subtype: "init"` | `model`, `tools[]` (includes `mcp__<server>__<tool>`), `mcp_servers[{name, status: "connected" \| ...}]`, `apiKeySource`, `permissionMode`, `cwd` | the run's `started` event; the MCP status is the connection badge |
| `assistant` | `message.content[]`: `thinking`, `text {text}`, `tool_use {id, name, input}` | one `tool_call` event per `tool_use`, one `text` event per `text`; skip `thinking` |
| `user` | `message.content[]`: `tool_result {tool_use_id, content}`; also `tool_use_result` | one `tool_result` event, matched to the call by `tool_use_id` |
| `result` | `subtype: "success" \| "error_max_turns" \| "error_during_execution" \| "error_max_budget_usd" \| "error_max_structured_output_retries"`, `num_turns`, `duration_ms`, `total_cost_usd`, `is_error`, `result` (final text), `structured_output` (when `outputFormat` was set) | the run's `finished` event; status, cost, text |
| `system` / other subtypes (`thinking_tokens`, `task_summary`, `post_turn_summary`, `status`, ...) | noise | ignore: `m.type === "system" && m.subtype !== "init"` |

`includePartialMessages: true` adds `stream_event` messages for token streaming. Not needed: the run page polls
the events table every 2 s.

Verified `WebSearch` shape: a `tool_use` named `WebSearch` with `input: { query }`, then a `tool_result` whose
content is the results as text. Verified `Write`: `input: { file_path, content }`, the file exists in `cwd` after
the run. Verified `outputFormat` with `allowedTools: []`: the model calls a `StructuredOutput` tool and
`result.structured_output` holds the object.

## Mapping the five steps onto it

1. **Basics**: `POST /api/runs` inserts the run and returns its id at once; the loop runs in `after()` (Next 16,
   `import { after } from "next/server"`), every message becomes a `run_events` row (`run_id, seq, kind, payload,
   at`), the `result` closes the run. `export const runtime = "nodejs"; export const maxDuration = 300;` on the
   route. `next.config.ts`: `serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"]` so the binary is not
   bundled.
2. **News to CSV**: the prompt names the file (`output.csv` in the working directory, columns title, url, source,
   date, summary); after `result`, read `runDir/*.csv` into an `artifacts` row (name, mime, content) and serve it
   at `/api/runs/[id]/artifacts/[name]` with `Content-Disposition: attachment`. If WebSearch answers 400 (the
   Console org can switch it off), fall back to `WebFetch` on three RSS feeds named in the prompt.
3. **Observable**: the timeline is the events; the **key state** is derived from them and shown as a card: status,
   turn n of maxTurns, the last tool and its input in one line, tools used so far, the connections in use (from
   `init.mcp_servers`), artifacts so far, cost and duration once the result is in.
4. **Connection**: a `connections` table (`id, name, enabled`); `mcpServers` is passed only when enabled;
   `allowedTools` gains `"mcp__github__*"`; the timeline labels `mcp__github__*` calls "via GitHub"; the state
   card shows "using: GitHub (read-only)" from the init message. Token: `gh auth token` into
   `.claude/scripts/set-secret.sh GITHUB_TOKEN` (never printed). Fallback with no auth at all:
   `{ deepwiki: { type: "http", url: "https://mcp.deepwiki.com/mcp" } }` (tools `read_wiki_structure`,
   `read_wiki_contents`, `ask_wiki_question`; connected in the spike; `ask_wiki_question` is slow).
5. **Evaluation**: runs as the run's last step. Deterministic first (parses with `csv-parse/sync`, required
   columns, 5+ rows, valid URLs, dates within 7 days, no duplicate URLs), then a judge: a second `query()` with
   no tools (`allowedTools: []`, everything disallowed) and `outputFormat: { type: "json_schema", schema }`
   scoring rows (`onTopic`, `score`, `reason`); or the kit's `decide()` (Jev) for the closed questions. The
   verdict is stored on the run and shown pass / fail with reasons.

## Backends

- **Anthropic direct** (the key Duvo sent): `ANTHROPIC_API_KEY` in `.env.local` via `set-secret.sh`; model ids
  like `claude-sonnet-5`. `init.apiKeySource` confirms which key the child used.
- **OpenRouter as an Anthropic-compatible backend**, verified today, the fallback if that key fails:
  `env: { ...process.env, ANTHROPIC_BASE_URL: "https://openrouter.ai/api", ANTHROPIC_AUTH_TOKEN:
  process.env.OPENROUTER_API_KEY, ANTHROPIC_API_KEY: "" }` and `model: "anthropic/claude-sonnet-4.6"`.
  WebSearch worked through it too.

## Testing without a model

There is no mocked model for this SDK. Test the pure parts: the message-to-event mapper, the events-to-state
derivation, the CSV checks and the verdict. Capture one real run's messages into `fixtures/sdk-messages.json`
during WP0 and drive the mapper and the state card from it. The live path is checked by the QA walk.

## Gotchas, each one hit or read today

- `settingSources` omitted = user + project + local settings loaded, CLAUDE.md included. Always `[]`.
- `env` replaces the child's environment: spread `process.env` and add the key, or the child has no key.
- `allowedTools` auto-approves and does not restrict; `disallowedTools` removes. Use both.
- `bypassPermissions` lets the agent write anywhere under `cwd`: keep `cwd` at `runs/<id>` (add `runs/` to
  `.gitignore`) and disallow `Bash` and `Edit`.
- One run = one subprocess. Start it in `after()`, never in a render, never two for one run.
- The Claude Code preset system prompt is large; a plain string `systemPrompt` is several times cheaper.
- `WebSearch` is capped at 200 searches per session; `maxTurns` and `maxBudgetUsd` end a runaway run and the
  `result.subtype` says which one did.
