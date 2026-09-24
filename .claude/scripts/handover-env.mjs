#!/usr/bin/env node
// Sets the Handover project's production environment on Vercel (this checkout is linked to it: .vercel/project.json).
// Model keys are copied from this repo's .env.local; the sign-in secret and the encryption key are generated fresh
// for Handover (never shared with local or with v1). Values go to `vercel env add` on stdin and are never printed.
// Usage: node .claude/scripts/handover-env.mjs [NAME=value ...]   (plain settings such as BETTER_AUTH_URL=...)
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const deployDir = root;
const parse = (f) =>
  Object.fromEntries(
    fs.readFileSync(f, "utf8").split("\n")
      .map((l) => l.match(/^(?:export +)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
  );
const local = parse(path.join(root, ".env.local"));

const existing = execFileSync("vercel", ["env", "ls", "production"], { cwd: deployDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  .split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((n) => /^[A-Z_]+$/.test(n ?? ""));

const set = (name, value) => {
  if (existing.includes(name)) execFileSync("vercel", ["env", "rm", name, "production", "--yes"], { cwd: deployDir, stdio: "ignore" });
  execFileSync("vercel", ["env", "add", name, "production"], { cwd: deployDir, input: value, stdio: ["pipe", "ignore", "ignore"] });
  console.log(`handover-env: set ${name}`);
};

const args = process.argv.slice(2);
if (args.length) {
  for (const a of args) {
    const [name, ...rest] = a.split("=");
    set(name, rest.join("="));
  }
} else {
  for (const name of ["ANTHROPIC_API_KEY", "TYPESAFE_API_KEY", "OPENROUTER_API_KEY"]) {
    if (!local[name]) throw new Error(`.env.local has no ${name}`);
    set(name, local[name]);
  }
  if (!existing.includes("BETTER_AUTH_SECRET")) set("BETTER_AUTH_SECRET", crypto.randomBytes(32).toString("base64"));
  if (!existing.includes("CONNECTION_KEY")) set("CONNECTION_KEY", crypto.randomBytes(32).toString("base64"));
  set("SIGNUP_MODE", "invite");
  set("RUNNER", "inline");
}
