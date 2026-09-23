#!/usr/bin/env node
// v2 is built locally against its own database so production (v1, in the reviewer's hands) is never written to.
// Points DATABASE_URL in .env.local at the QA database (QA_DATABASE_URL from .env.qa), keeps the production URL as
// PROD_DATABASE_URL so `--restore` can put it back, and adds the auth and encryption secrets v2 needs.
// Prints variable names only, never a value. Keeps a backup of the previous file in .claude/run/ (ignored).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const localPath = path.join(root, ".env.local");
const qaPath = path.join(root, ".env.qa");
const parse = (f) =>
  Object.fromEntries(
    fs.readFileSync(f, "utf8").split("\n")
      .map((l) => l.match(/^(?:export +)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );

const text = fs.readFileSync(localPath, "utf8");
const L = parse(localPath);
fs.mkdirSync(path.join(root, ".claude/run"), { recursive: true });
fs.writeFileSync(path.join(root, ".claude/run/env.local.bak"), text);

const managed = /^(DATABASE_URL|PROD_DATABASE_URL|BETTER_AUTH_SECRET|BETTER_AUTH_URL|CONNECTION_KEY)=|^# v2 \(local\)/;
const lines = text.split("\n").filter((l) => !managed.test(l));
while (lines.length && lines.at(-1) === "") lines.pop();

const prod = L.PROD_DATABASE_URL ?? L.DATABASE_URL;
if (process.argv.includes("--restore")) {
  lines.push(`DATABASE_URL=${prod}`);
} else {
  const Q = parse(qaPath);
  if (!Q.QA_DATABASE_URL) throw new Error(".env.qa has no QA_DATABASE_URL");
  lines.push("# v2 (local): the app runs on the QA database; production keeps its own. Undo: node .claude/scripts/v2-env.mjs --restore");
  lines.push(`DATABASE_URL=${Q.QA_DATABASE_URL}`);
  lines.push(`PROD_DATABASE_URL=${prod}`);
  lines.push(`BETTER_AUTH_SECRET=${L.BETTER_AUTH_SECRET ?? crypto.randomBytes(32).toString("base64")}`);
  lines.push("BETTER_AUTH_URL=http://localhost:3000");
  lines.push(`CONNECTION_KEY=${L.CONNECTION_KEY ?? crypto.randomBytes(32).toString("base64")}`);
}
fs.writeFileSync(localPath, lines.join("\n") + "\n");
const N = parse(localPath);
console.log("v2-env: vars:", Object.keys(N).join(" "));
console.log("v2-env: DATABASE_URL is", N.DATABASE_URL === prod ? "PRODUCTION" : "the QA database");
