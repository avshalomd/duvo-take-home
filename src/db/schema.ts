import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Baseline table so the pipeline (push, health check, deploy) was proven before the task started.
// Keep it: src/db/transaction.int.test.ts uses it. Add the task tables beside it.
export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

import { boolean, index, integer, jsonb, real } from "drizzle-orm/pg-core";

// One automation: instructions in, a report and files out. Status moves queued -> running -> evaluating -> succeeded | failed.
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
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
});

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The user's MCP servers. Only http/sse: a stdio server needs a command on the host.
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  transport: text("transport").notNull().default("http"),
  token: text("token"), // stored as entered (demo); never rendered back to the UI
  enabled: boolean("enabled").notNull().default(true),
  lastStatus: text("last_status"), // from the last run's init message
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
