import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Baseline table so the pipeline (push, health check, deploy) was proven before the task started.
// Keep it: src/db/transaction.int.test.ts uses it. Add the task tables beside it.
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

import { sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";

// Users, sessions and workspaces (Better Auth; its "organization" is our workspace). Generated: `npx @better-auth/cli generate`.
export * from "./auth-schema";

// Better Auth's rate-limit counts (lib/auth/auth.ts, Q176): one row per client address and path, e.g.
// "203.0.113.7|/sign-in/email". In the database, not in each function instance's memory, so every instance on Vercel
// counts the same tries. Better Auth finds it by the export name `rateLimit`; `last_request` is milliseconds since 1970.
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// One automation: instructions in, a report and files out. Status moves queued -> running -> evaluating -> succeeded | failed,
// or -> cancelled when the user stops it. v2 columns are nullable or defaulted, so v1 rows stay valid.
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id"), // the tenant; every query filters on it (null only on rows from before v2)
  createdBy: text("created_by"), // the user who started it; null for a schedule
  purpose: text("purpose").notNull().default("adhoc"), // adhoc | trial (an automation's example) | automation | schedule | followup
  automationId: uuid("automation_id"), // set when the run was started from an automation or as its trial
  automationVersion: integer("automation_version"), // the version it ran, so an edit invalidates earlier trials
  input: text("input"), // the text after the command: "/audit Apple Inc." -> "Apple Inc."
  parentRunId: uuid("parent_run_id"), // a follow-up ("ask for a change") points at the run it continues
  sessionId: text("session_id"), // the Agent SDK session, so a follow-up can resume it
  cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }), // Stop sets it; the loop aborts within 2 s
  humanVerdict: text("human_verdict"), // approved | rejected: the person's own judgment of the result
  humanVerdictBy: text("human_verdict_by"), // the user id of who judged it; null on rows judged before it was stored
  humanNote: text("human_note"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  healAttempts: integer("heal_attempts").notNull().default(0), // how many times this run fixed its own result
  prompt: text("prompt").notNull(),
  status: text("status").notNull().default("queued"),
  model: text("model").notNull(),
  connectionIds: jsonb("connection_ids").$type<string[]>().notNull().default([]), // what the agent was given, frozen at start
  report: text("report"),
  error: text("error"),
  verdict: jsonb("verdict"), // the evaluator's Verdict, stored whole so pass/fail can be defended later
  numTurns: integer("num_turns"),
  durationMs: integer("duration_ms"),
  costUsd: real("cost_usd"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [index("runs_ws_created").on(t.workspaceId, t.createdAt), index("runs_automation").on(t.automationId)]);

// The trace: every SDK message that matters, in order. The key state is derived from these rows, never stored.
export const runEvents = pgTable("run_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  seq: integer("seq").notNull(),
  kind: text("kind").notNull(), // started | text | tool_call | tool_result | plan | finished
  payload: jsonb("payload").notNull(), // validated with RunEvent on read, not trusted from the column type
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("run_events_run_seq").on(t.runId, t.seq)]);

// Text files the agent wrote (.txt, .md, .csv only), copied out of the run's working directory when it finished.
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  content: text("content").notNull(), // small text files; a blob store is overkill for a CSV
  encoding: text("encoding").notNull().default("utf8"), // utf8 | base64 (an .xlsx from the spreadsheet tool)
  flags: jsonb("flags").$type<{ kind: "credential" | "email" | "phone" | "card" | "iban"; count: number; detail: string }[]>().notNull().default([]), // what the output scan found
  quarantined: boolean("quarantined").notNull().default(false), // credentials found: held back until the user confirms
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The user's MCP servers. Only http/sse: a stdio server needs a command on the host.
export const CONNECTIONS_WS_KEY = "connections_ws_key";
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id"),
  authType: text("auth_type").notNull().default("none"), // none | bearer | oauth
  tokenEnc: text("token_enc"), // AES-256-GCM under CONNECTION_KEY; replaces `token` (v1, plain) once re-encrypted
  oauth: jsonb("oauth"), // client registration + encrypted tokens + expiry, for servers that sign in with OAuth
  tools: jsonb("tools").$type<string[]>().notNull().default([]), // the tool names the last run saw from it
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  transport: text("transport").notNull().default("http"),
  token: text("token"), // stored as entered (demo); never rendered back to the UI
  enabled: boolean("enabled").notNull().default(true),
  lastStatus: text("last_status"), // from the last run's init message
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // A name's key (lib/connections/key.ts, written in SQL) once per workspace (F6): the store's check before a write
  // cannot see a write racing it, and a run registers each server under that key, so one would replace the other.
  uniqueIndex(CONNECTIONS_WS_KEY).on(t.workspaceId, sql`trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))`),
]);

// A saved automation: a template the user drafted from a run, tested on examples, approved, and now calls as
// "/<command> <input>". An edit bumps the version and sends it back to draft until an example is approved again.
export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id").notNull(),
  createdBy: text("created_by"),
  name: text("name").notNull(),
  command: text("command").notNull(), // lower-case, no prefix: "audit"
  description: text("description").notNull().default(""),
  inputLabel: text("input_label").notNull().default("Input"), // "Company name"
  inputHint: text("input_hint").notNull().default(""), // "The company's registered name"
  inputExample: text("input_example").notNull().default(""), // the value the source run used, offered as the first example
  template: jsonb("template").notNull(), // AutomationTemplate: instructions with {input}, outputs, steps, connections
  status: text("status").notNull().default("draft"), // draft | active | disabled
  version: integer("version").notNull().default(1),
  createdFromRunId: uuid("created_from_run_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  schedule: text("schedule"), // cron, e.g. "0 8 * * 1"; null when it only runs on demand
  scheduleInput: text("schedule_input"),
  scheduleTz: text("schedule_tz"), // the IANA time zone the schedule was set in, so 08:00 stays 08:00 across DST
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("automations_ws_command").on(t.workspaceId, t.command)]);

// Per-workspace limits and guard settings. One row per workspace, created with defaults on first read.
export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: text("workspace_id").primaryKey(),
  dailyBudgetUsd: real("daily_budget_usd").notNull().default(5),
  dailyRunLimit: integer("daily_run_limit").notNull().default(30),
  maxInFlight: integer("max_in_flight").notNull().default(3),
  stepChecks: boolean("step_checks").notNull().default(true), // Jev after every finished step
  strictConnections: boolean("strict_connections").notNull().default(false), // block, not flag, a connection the plan did not name
  deniedDomains: jsonb("denied_domains").$type<string[]>().notNull().default([]),
  autoHealAttempts: integer("auto_heal_attempts").notNull().default(2), // how many times a run may fix its own result after the evaluator fails it (his call, 2026-09-23)
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// The queue for RUNNER=queue: the web app inserts a job, the worker claims it with FOR UPDATE SKIP LOCKED.
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => runs.id),
  status: text("status").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("jobs_status_created").on(t.status, t.createdAt)]);
