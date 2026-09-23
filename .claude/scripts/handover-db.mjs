#!/usr/bin/env node
// Runs a command in this repo against the HANDOVER production database (not local, not v1): DATABASE_URL is taken
// from ../handover/.env.production.local (pulled with `vercel env pull` in the deploy folder). Prints no value.
// Usage: node .claude/scripts/handover-db.mjs npx drizzle-kit push --force
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const file = path.resolve(root, "../handover/.env.production.local");
const vars = Object.fromEntries(
  fs.readFileSync(file, "utf8").split("\n")
    .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
);
if (!vars.DATABASE_URL) throw new Error("no DATABASE_URL in ../handover/.env.production.local");
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: vars.DATABASE_URL, HANDOVER_TARGET: "1" } });
process.exit(r.status ?? 1);
