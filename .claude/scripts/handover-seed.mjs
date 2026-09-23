#!/usr/bin/env node
// Seeds Handover's production database with a small, curated demo workspace. Run it through handover-db.mjs, which
// sets DATABASE_URL to Handover's database:  node .claude/scripts/handover-db.mjs node .claude/scripts/handover-seed.mjs
// - the demo account (invite-only sign-up, so this is how the first person gets in); its password is generated and
//   saved to .claude/run/handover-demo.txt (git-ignored), never printed;
// - two keyless connections (DeepWiki, Hugging Face);
// - the four runs the v1 reviewer saw, copied read-only from v1's database (PROD_DATABASE_URL in .env.local);
// - the "News digest CSV" automation with its approved example and one run by command, from the local QA database.
// It refuses to write to the local QA database or to v1's database. Safe to run again (existing rows are kept).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const local = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split("\n")
    .map((l) => l.match(/^(?:export +)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
);
const TARGET = process.env.DATABASE_URL;
if (process.env.HANDOVER_TARGET !== "1" || !TARGET) throw new Error("run through handover-db.mjs");
if (TARGET === local.DATABASE_URL || TARGET === local.PROD_DATABASE_URL) throw new Error("refusing: the target is not Handover's database");

const target = neon(TARGET);
const qa = neon(local.DATABASE_URL); // read only
const v1 = neon(local.PROD_DATABASE_URL); // read only

const WS = "handover-demo";
const USER = "handover-demo-user";
const EMAIL = "demo@handover.example"; // a reserved domain: no one else can own it
const now = new Date();

const JSONB = new Set(["payload", "verdict", "connection_ids", "template", "flags", "tools", "oauth", "denied_domains"]);
async function insert(table, row) {
  const keys = Object.keys(row);
  const values = keys.map((k) => (JSONB.has(k) && row[k] !== null ? JSON.stringify(row[k]) : row[k]));
  const cols = keys.map((k) => `"${k}"`).join(", ");
  const params = keys.map((k, i) => (JSONB.has(k) ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(", ");
  await target.query(`insert into "${table}" (${cols}) values (${params}) on conflict do nothing`, values);
}

async function copyRun(source, idPrefix, overrides) {
  const [run] = await source.query(`select * from runs where id::text like $1`, [`${idPrefix}%`]);
  if (!run) throw new Error(`no run ${idPrefix}`);
  const keep = ["id", "prompt", "status", "model", "report", "error", "verdict", "num_turns", "duration_ms", "cost_usd", "created_at", "finished_at",
    "purpose", "automation_id", "automation_version", "input", "human_verdict", "human_note", "reviewed_at", "heal_attempts"];
  const row = Object.fromEntries(keep.filter((k) => k in run).map((k) => [k, run[k]]));
  await insert("runs", { ...row, connection_ids: [], workspace_id: WS, created_by: USER, ...overrides });
  for (const e of await source.query(`select run_id, seq, kind, payload, at from run_events where run_id = $1 order by seq`, [run.id])) await insert("run_events", e);
  for (const f of await source.query(`select * from files where run_id = $1`, [run.id])) {
    const keepF = ["run_id", "name", "mime", "bytes", "content", "encoding", "flags", "quarantined", "created_at"];
    await insert("files", Object.fromEntries(keepF.filter((k) => k in f).map((k) => [k, f[k]])));
  }
  return run.id;
}

async function main() {
  // the demo account: invite-only sign-up means someone has to exist to invite the others
  const secretFile = path.join(root, ".claude/run/handover-demo.txt");
  let password;
  if (fs.existsSync(secretFile)) password = fs.readFileSync(secretFile, "utf8").match(/password: (.*)/)[1].trim();
  else {
    password = crypto.randomBytes(12).toString("base64url");
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, `Handover demo account\nemail: ${EMAIL}\npassword: ${password}\n`, { mode: 0o600 });
  }
  await insert("user", { id: USER, name: "Demo", email: EMAIL, email_verified: true, created_at: now, updated_at: now });
  await insert("account", { id: "handover-demo-account", account_id: USER, provider_id: "credential", user_id: USER, password: await hashPassword(password), created_at: now, updated_at: now });
  await insert("organization", { id: WS, name: "Handover demo", slug: "handover-demo", created_at: now });
  await insert("member", { id: "handover-demo-member", organization_id: WS, user_id: USER, role: "owner", created_at: now });
  await insert("workspace_settings", { workspace_id: WS });

  await insert("connections", { id: crypto.randomUUID(), workspace_id: WS, name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp", transport: "http", enabled: true, auth_type: "none" });
  await insert("connections", { id: crypto.randomUUID(), workspace_id: WS, name: "Hugging Face", url: "https://huggingface.co/mcp", transport: "http", enabled: true, auth_type: "none" });

  // the four runs the v1 reviewer saw (AI news, DeepWiki, Jev use cases, the Nvidia fail)
  for (const id of ["91df8413", "9f5eaca5", "4dd0010e", "362d103d"]) await copyRun(v1, id, { purpose: "adhoc" });

  // the News digest automation, its approved example and one run by its command
  const [a] = await qa.query(`select * from automations where id::text like '50534fbf%'`);
  if (a) {
    const keepA = ["id", "name", "command", "description", "input_label", "input_hint", "input_example", "template", "status", "version", "approved_at", "created_at", "updated_at"];
    await insert("automations", { ...Object.fromEntries(keepA.map((k) => [k, a[k]])), workspace_id: WS, created_by: USER, created_from_run_id: null, schedule: null, schedule_input: null, schedule_tz: null, next_run_at: null });
    await copyRun(qa, "f19e456b", {});
    await copyRun(qa, "e1c010fb", {});
  }

  const [{ n }] = await target.query(`select count(*)::int as n from runs where workspace_id = $1`, [WS]);
  console.log(`handover-seed: demo workspace has ${n} runs; the demo account is in .claude/run/handover-demo.txt`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
