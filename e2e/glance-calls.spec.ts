import { expect, test, type Locator, type Page } from "@playwright/test";
import { sql } from "./auth-helpers";

// The owner's calls on UX QA U20, U21, U24, U25 and U30 (2026-09-24): a cut brief can be read in full, a text file's
// tile shows its first lines, several connections read as one line, Ask for a change gives an example that fits,
// and a person's judgment that the automatic check does not share is said in one sentence.
//   BASE_URL=http://localhost:3006 npx playwright test e2e/glance-calls.spec.ts
// Its rows are "[e2e] calls ..." runs, one "[e2e] calls check" automation and "e2e calls ..." connections, all in the
// demo workspace and all deleted afterwards. It never starts an agent run.
const PREFIX = "[e2e] calls";
const WORKSPACE = "demo-workspace";
const COMMAND = "e2e-calls-check";
const CONNECTIONS = ["e2e calls Drive", "e2e calls Mail", "e2e calls Wiki"];
const BRIEFS = {
  long: `${PREFIX} long: read the three most recent quarterly reports of every listed European carmaker, compare their margins, their order books and what each says about electric models, then write a two-page summary for the board`,
  chart: `${PREFIX} chart: draw the Moon's distance by month`,
  csv: `${PREFIX} csv: list five news sources`,
  notes: `${PREFIX} notes: write three facts about the Moon`,
  example: `${PREFIX} example: check Initech`,
};
const NOTES = "# Moon facts\n\n- It is **384,400 km** away\n- It has no air\n- Its day lasts a month\n";
const PASS = { verdict: "pass", checks: [{ id: "report", label: "A report was written", ok: true, detail: "40 characters" }], judgment: null, review: null, reasons: [], evaluatedAt: new Date().toISOString(), decidedBy: "checks", path: ["checks"] };
const FAIL = { ...PASS, verdict: "fail", checks: [{ id: "rows", label: "At least 8 rows", ok: false, detail: "3 rows" }], reasons: ["At least 8 rows: 3 rows"] };
const PLAN = { intent: "", expectedOutputs: [], sources: [], steps: [{ index: 0, title: "Do the work", status: "done" }] };

type Ids = { long: string; chart: string; csv: string; notes: string; example: string; automation: string };
let ids: Ids;

async function cleanUp() {
  const db = sql();
  const runs = `select id from runs where prompt like '${PREFIX}%'`; // the prefix is a constant, never user input
  await db.query(`delete from run_events where run_id in (${runs})`);
  await db.query(`delete from files where run_id in (${runs})`);
  await db.query(`delete from model_spend where run_id in (select id from runs where prompt like '${PREFIX}%')`);
  await db.query(`delete from runs where prompt like '${PREFIX}%'`);
  await db.query("delete from automations where workspace_id = $1 and command = $2", [WORKSPACE, COMMAND]);
  await db.query("delete from connections where workspace_id = $1 and name like 'e2e calls %'", [WORKSPACE]);
}

test.beforeAll(async () => {
  await cleanUp(); // a crashed earlier run may have left its rows behind
  const db = sql();
  const [auto] = await db.query(
    `insert into automations (workspace_id, created_by, name, command, description, input_label, input_hint, input_example, template, status)
     values ($1, 'demo-user', '[e2e] calls check', $2, 'Checks a company', 'Company name', 'e.g. Acme Ltd', 'Acme Ltd', $3::jsonb, 'draft') returning id`,
    [WORKSPACE, COMMAND, JSON.stringify({ instructions: "Check {input}", intent: "", expectedOutputs: ["check.csv about {input}"], outputFormat: "", steps: ["Search"], connections: [] })],
  );
  const insert = async (prompt: string, verdict: unknown, extra: { automation?: string; human?: string } = {}) => {
    const [r] = await db.query(
      `insert into runs (workspace_id, created_by, purpose, prompt, status, model, report, verdict, human_verdict, human_verdict_by, automation_id, automation_version, input, created_at, finished_at)
       values ($1, 'demo-user', $2, $3, 'succeeded', 'e2e', 'Done.', $4::jsonb, $5, $6, $7, $8, $9, now(), now()) returning id`,
      [WORKSPACE, extra.automation ? "trial" : "adhoc", prompt, JSON.stringify(verdict), extra.human ?? null, extra.human ? "demo-user" : null,
        extra.automation ?? null, extra.automation ? 1 : null, extra.automation ? "Initech" : null],
    );
    await db.query("insert into run_events (run_id, seq, kind, payload) values ($1, 1, 'plan', $2::jsonb)", [r.id, JSON.stringify(PLAN)]);
    return r.id as string;
  };
  const file = (runId: string, name: string, mime: string, content: string) =>
    db.query("insert into files (run_id, name, mime, bytes, content) values ($1, $2, $3, $4, $5)", [runId, name, mime, Buffer.byteLength(content), content]);

  ids = {
    long: await insert(BRIEFS.long, PASS),
    chart: await insert(BRIEFS.chart, PASS),
    csv: await insert(BRIEFS.csv, PASS),
    notes: await insert(BRIEFS.notes, PASS),
    example: await insert(BRIEFS.example, FAIL, { automation: auto.id, human: "approved" }),
    automation: auto.id as string,
  };
  await file(ids.chart, "chart.svg", "image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  await file(ids.csv, "sources.csv", "text/csv", "name,url\nA,https://a.example\n");
  await file(ids.notes, "notes.md", "text/markdown", NOTES);
  await file(ids.notes, "haiku.txt", "text/plain", "An old silent pond");
});

test.afterAll(cleanUp);

async function openRun(page: Page, id: string) {
  await page.goto(`/?run=${id}`);
  const panel = page.getByTestId("run-panel");
  await expect(panel).toBeVisible();
  return panel;
}

const lines = (el: Locator) =>
  el.evaluate((node) => node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight));

test.describe("U20: the brief as the title", () => {
  test("a brief cut to two lines opens in place from its title, and closes again", async ({ page }) => {
    await openRun(page, ids.long);
    const title = page.locator("#run-title");
    const toggle = title.getByRole("button");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveText(BRIEFS.long);
    expect(await lines(title)).toBeLessThanOrEqual(2.05);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => lines(title)).toBeGreaterThan(2.5); // the whole brief, grown into place

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => lines(title)).toBeLessThanOrEqual(2.05);
  });

  test("on a phone a tap opens it, and the keyboard can too", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRun(page, ids.long);
    const toggle = page.locator("#run-title").getByRole("button");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("a title that fits in two lines is plain text, not a button", async ({ page }) => {
    await openRun(page, ids.chart);
    await expect(page.locator("#run-title")).toHaveText(BRIEFS.chart);
    await expect(page.locator("#run-title").getByRole("button")).toHaveCount(0);
  });
});

test.describe("U21: a text file's tile", () => {
  test("shows its first lines, as words, and how many lines it has instead of bytes", async ({ page }) => {
    const panel = await openRun(page, ids.notes);
    const files = panel.getByTestId("files");
    const notes = files.getByRole("listitem").filter({ hasText: "notes.md" });
    await expect(notes.getByTestId("text-preview")).toHaveText(["Moon facts", "• It is 384,400 km away", "• It has no air"]);
    await expect(notes).toContainText("4 lines");
    await expect(notes).not.toContainText("bytes");
    await expect(notes.getByRole("link", { name: "Download notes.md (4 lines)" })).toBeVisible();

    const haiku = files.getByRole("listitem").filter({ hasText: "haiku.txt" });
    await expect(haiku).toContainText("1 line");
    await expect(haiku.getByTestId("text-preview")).toHaveText(["An old silent pond"]);
  });
});

test.describe("U25: Ask for a change", () => {
  const box = (page: Page) => page.getByRole("textbox", { name: "Ask for a change" });
  for (const [run, placeholder] of [
    ["chart", "What should change? For example: make the bars horizontal"],
    ["csv", "What should change? For example: add a column with each source's country"],
    ["notes", "What should change?"],
  ] as const) {
    test(`gives an example that fits a run that made a ${run === "notes" ? "text file" : run}`, async ({ page }) => {
      const panel = await openRun(page, ids[run]);
      await panel.getByRole("button", { name: "Ask for a change" }).click();
      await expect(box(page)).toHaveAttribute("placeholder", placeholder);
    });
  }
});

test.describe("U30: a judgment the automatic check does not share", () => {
  const SAID = "You marked it right; the automatic check did not pass it.";

  test("the run page's outcome line says both in one sentence", async ({ page }) => {
    const panel = await openRun(page, ids.example);
    await expect(panel.getByTestId("outcome")).toHaveText(SAID);
  });

  test("the example card says it the same way", async ({ page }) => {
    await page.goto(`/automations/${ids.automation}`);
    await expect(page.getByTestId("example").getByTestId("example-outcome")).toHaveText(SAID);
  });

  test("a run nobody judged keeps its own outcome", async ({ page }) => {
    const panel = await openRun(page, ids.csv);
    await expect(panel.getByTestId("outcome")).toHaveText("Done, looks good");
  });
});

test.describe("U24: the connections under the composer", () => {
  test.beforeAll(async () => {
    for (const name of CONNECTIONS)
      await sql().query("insert into connections (workspace_id, name, url, enabled) values ($1, $2, $3, true)", [WORKSPACE, name, `https://${name.replace(/ /g, "-")}.example/mcp`]);
  });
  test.afterAll(async () => {
    await sql().query("delete from connections where workspace_id = $1 and name like 'e2e calls %'", [WORKSPACE]);
  });

  test("several read as one line on a phone, and the whole list opens from it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const on = (await sql().query("select name from connections where workspace_id = $1 and enabled order by created_at", [WORKSPACE])).map((r) => r.name as string);
    await openRun(page, ids.csv);
    const row = page.getByTestId("composer-connections");
    await expect(row).toHaveText(`Using ${on[0]} and ${on.length - 1} more`);
    const box = (await row.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(40); // one line, not a wrap of chips

    await row.getByRole("button", { name: `${on[0]} and ${on.length - 1} more` }).click();
    const list = page.getByRole("dialog", { name: "The next run can use" });
    await expect(list).toBeVisible();
    for (const name of on) await expect(list.getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
    await expect(list.getByRole("link", { name: "Change in Settings" })).toHaveAttribute("href", "/settings/connections");

    await page.keyboard.press("Escape");
    await expect(list).toHaveCount(0);
  });
});
