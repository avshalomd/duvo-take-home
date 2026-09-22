// Run a command against the QA database: the app's own keys from .env.local, DATABASE_URL swapped for the
// separate Neon project (QA_DATABASE_URL in .env.qa, pulled from Vercel's development environment).
// Nothing is printed. Usage: node .claude/scripts/qa-env.mjs <cmd> [args...]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
function parse(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return env;
}
const local = parse(".env.local");
const qa = parse(".env.qa");
const url = qa.QA_DATABASE_URL;
if (!url) { console.error("no QA_DATABASE_URL in .env.qa (vercel env pull .env.qa --environment=development)"); process.exit(1); }
const env = { ...process.env, ...local, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, QA_DB: "1" };
const [cmd, ...args] = process.argv.slice(2);
spawn(cmd, args, { stdio: "inherit", env }).on("exit", (code) => process.exit(code ?? 1));
