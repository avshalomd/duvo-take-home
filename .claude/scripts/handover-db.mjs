#!/usr/bin/env node
// Runs a command in this repo against Handover's PRODUCTION database (never the local one): DATABASE_URL is taken
// from .vercel/.env.production.local, which `vercel pull --yes --environment production` writes (git-ignored).
// Prints no value.
// Usage: node .claude/scripts/handover-db.mjs npx drizzle-kit push --force
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const file = path.resolve(root, ".vercel/.env.production.local");
const vars = Object.fromEntries(
  fs.readFileSync(file, "utf8").split("\n")
    .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
);
if (!vars.DATABASE_URL) throw new Error("no DATABASE_URL in .vercel/.env.production.local (vercel pull --yes --environment production)");
const [cmd, ...args] = process.argv.slice(2);
const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: vars.DATABASE_URL, HANDOVER_TARGET: "1" } });
process.exit(r.status ?? 1);
