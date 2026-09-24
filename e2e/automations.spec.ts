import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

// The automation builder, from a finished run to a draft that cannot be approved yet. Signed in as the demo user by
// the "setup" project (e2e/auth.setup.ts). It makes one real, cheap LLM call (the draft) and starts no agent run.
// The source run is its own, "[e2e] ...", deleted in afterAll with the draft: the picker lists only the 12 newest
// finished runs, and in the full suite the flow tests' seeded runs pushed a shared one off it.
//   npx playwright test e2e/automations.spec.ts

const SOURCE_PROMPT = "[e2e] automations: What is the difference between an LLM agent and a workflow?"; // no files: the cheapest draft
const SOURCE_RUN = /\[e2e\] automations: What is the difference between an LLM agent and a workflow/;
let sourceId: string | null = null;
let createdId: string | null = null;

function sql() {
  // the dev server under test reads .env.local; so does this, so both look at the same database
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local");
  return neon(process.env.DATABASE_URL!);
}

test.beforeAll(async () => {
  // dated an hour ahead, so it is the newest finished run whatever the other specs insert while this one runs
  const [row] = await sql()`insert into runs (workspace_id, prompt, status, model, purpose, report, created_at, finished_at)
    values ('demo-workspace', ${SOURCE_PROMPT}, 'succeeded', 'e2e', 'adhoc',
      'An agent decides its next step as it goes; a workflow follows steps fixed in advance.',
      now() + interval '1 hour', now() + interval '1 hour')
    returning id`;
  sourceId = row.id as string;
});

test.afterAll(async () => {
  if (createdId) await sql()`delete from automations where id = ${createdId}`;
  if (sourceId) await sql()`delete from runs where id = ${sourceId}`;
});

test("a finished run becomes a draft automation that can be edited and cannot be approved before an example", async ({ page }) => {
  test.setTimeout(120_000); // the draft is a real model call

  // the picker is a page of finished runs, the ones that did well first
  await page.goto("/automations");
  await page.getByRole("link", { name: "New from a run" }).click();
  await expect(page).toHaveURL(/\/automations\/new$/);
  await page.getByRole("link", { name: SOURCE_RUN }).first().click();

  // the loading state is real: the draft is written by a model while the page waits
  await expect(page.getByRole("heading", { name: "Writing a first draft" })).toBeVisible();
  await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  createdId = new URL(page.url()).pathname.split("/").pop() ?? null;

  // the draft reads as a document: the brief with the input drawn as a token, not as "{input}"
  const brief = page.getByTestId("brief");
  await expect(brief.getByTestId("input-token").first()).toBeVisible();
  await expect(brief).not.toContainText("{input}");

  // edit inline: the brief keeps its placeholder in the editor, a new name is saved and survives a reload
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("The brief")).toHaveValue(/\{input\}/);
  const name = `[e2e] Agent or workflow ${Date.now()}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name })).toBeVisible(); // the tab title carries the name too

  // no example has run, so approval is disabled and the bar says why
  await expect(page.getByRole("button", { name: "Approve and save" })).toBeDisabled();
  await expect(page.getByTestId("approve-reason")).toHaveText(/run an example/i);

  // the first example's input is offered from the run the draft came from
  await expect(page.getByLabel("Example input")).not.toHaveValue("");

  // Q118: the gallery never shows the raw placeholder
  await page.goto("/automations");
  await expect(page.getByTestId("gallery")).toBeVisible();
  await expect(page.getByTestId("gallery")).not.toContainText("{input}");
  // Q139: the tile is built around its command, which never breaks, a mini thread of its steps and its state in words
  const tile = page.getByTestId("automation-tile").filter({ hasText: name });
  await expect(tile.getByTestId("thread")).toBeVisible();
  await expect(tile).toContainText("Draft");
  await expect(tile.getByTestId("tile-command")).toHaveCSS("white-space", "nowrap");
  // commands are shown with the front slash only (his call), never a backslash
  await expect(page.getByTestId("gallery")).toContainText("/");
  await expect(page.getByTestId("gallery")).not.toContainText("\\");

  // clean up through the page, which is also the proof that Delete works
  await page.goto(`/automations/${createdId}`);
  await page.getByRole("button", { name: "Delete" }).click();
  const sheet = page.getByRole("dialog"); // the Members page's paper sheet, not the browser's own confirm (UX R2)
  await expect(sheet).toContainText(`Delete "${name}"?`);
  await sheet.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/automations$/);
  await expect(page.getByText(name)).toHaveCount(0);
});

// Review (frontend): judging an example again, saving an edit of a Ready automation, and cancelling a refused edit, on
// an automation seeded ready with one finished example ("[e2e]", deleted in afterAll with its run and a connection).
// The tests run in order: the judgment is of version 1, the save makes version 2, the cancel is on that draft.
test.describe("editing and judging a ready automation", () => {
  const stamp = Date.now().toString(36);
  const command = `e2e-edit-${stamp}`;
  const hiddenHost = `e2e-hidden-${stamp}.example.com`; // a connection's address, which the page never needs to send
  let automationId: string | null = null;
  let connectionId: string | null = null;
  const template = {
    instructions: "Write facts.md with three facts about {input}.",
    intent: "Writes three facts about a company.",
    expectedOutputs: ["facts.md with three facts about {input}"],
    outputFormat: "",
    steps: ["Find three facts about {input}", "Write facts.md"],
    connections: [],
  };

  test.beforeAll(async () => {
    const [a] = await sql()`
      insert into automations (workspace_id, name, command, description, input_label, input_hint, input_example, template, status, version, approved_at)
      values ('demo-workspace', '[e2e] Edited facts', ${command}, 'Writes three facts about a company.', 'Company name', 'e.g. Apple Inc.',
              'Acme Ltd', ${JSON.stringify(template)}::jsonb, 'active', 1, now())
      returning id`;
    automationId = a.id as string;
    await sql()`insert into runs (workspace_id, prompt, status, model, purpose, automation_id, automation_version, input, report, created_at, finished_at)
      values ('demo-workspace', '[e2e] Write facts.md with three facts about Acme Ltd.', 'succeeded', 'e2e', 'trial', ${automationId}, 1, 'Acme Ltd',
              'Three facts about Acme Ltd.', now(), now())`;
    // off, so no run is given it while it exists
    const [c] = await sql()`insert into connections (workspace_id, name, url, enabled) values ('demo-workspace', 'e2e automations hidden', ${`https://${hiddenHost}/mcp`}, false) returning id`;
    connectionId = c.id as string;
  });

  test.afterAll(async () => {
    if (automationId) await sql()`delete from runs where automation_id = ${automationId}`;
    if (automationId) await sql()`delete from automations where id = ${automationId}`;
    if (connectionId) await sql()`delete from connections where id = ${connectionId}`;
  });

  test("judging an example the same way again closes the form and says the judgment", async ({ page }) => {
    await page.goto(`/automations/${automationId}`);
    const card = page.getByTestId("example");
    await card.getByRole("button", { name: "Looks right" }).click();
    await expect(card.getByText("You said it looks right")).toBeVisible();

    await card.getByRole("button", { name: "Change" }).click();
    await card.getByRole("button", { name: "Looks right" }).click();
    await expect(card.getByText("You said it looks right")).toBeVisible();
    await expect(card.getByRole("button", { name: "Looks right" })).toHaveCount(0);
  });

  // UX QA U17: the owner read only a general line under Save, whether or not anything changed, not naming the command
  test("an approver who changes the brief is told beside Save that saving takes the command out of use", async ({ page }) => {
    const warning = page.getByText(`Saving takes /${command} out of use until a new example looks right.`);
    await page.goto(`/automations/${automationId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(warning).toHaveCount(0); // nothing changed yet
    await page.getByLabel("Hint", { exact: true }).fill("e.g. Globex"); // the agent never reads the hint
    await expect(warning).toHaveCount(0);
    await page.getByLabel("The brief").fill("Write facts.md with five facts about {input}.");
    await expect(warning).toBeVisible();
    await page.getByLabel("The brief").fill(template.instructions); // back as it was
    await expect(warning).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("saving a new brief says it is a new version, where the document now stands, and sends it back to draft", async ({ page }) => {
    await page.goto(`/automations/${automationId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("The brief").fill("Write facts.md with four facts about {input}.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. This is version 2 now: run an example of it before you approve.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and save" })).toBeVisible(); // the draft's page
  });

  test("an edit refused and then cancelled opens again with the saved automation, not what was typed", async ({ page }) => {
    await page.goto(`/automations/${automationId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Name", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Some fields need a change, see above.")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("[e2e] Edited facts");
    await expect(page.getByText("Some fields need a change, see above.")).toHaveCount(0);
  });

  test("the page names the workspace's connections without sending their addresses", async ({ page }) => {
    await page.goto(`/automations/${automationId}`);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("e2e automations hidden")).toBeVisible(); // offered in the editor, so the page has it
    expect(await page.content()).not.toContain(hiddenHost);
  });
});

// A ready automation needs an approved example, which is a real agent run: this one is seeded straight into the
// table instead ("[e2e]", deleted in afterAll), so the ready page can be checked without spending a run.
test.describe("a ready automation", () => {
  test.use({ timezoneId: "Europe/Prague" }); // the browser's zone, which the schedule form sends with the cron
  let readyId: string | null = null;
  const command = `e2e-ready-${Date.now().toString(36)}`;
  const template = {
    instructions: "Write facts.md with three facts about {input}.",
    intent: "Writes three facts about a company.",
    expectedOutputs: ["facts.md with three facts about {input}"],
    outputFormat: "",
    steps: ["Find three facts about {input}", "Write facts.md"],
    connections: [],
  };

  test.beforeAll(async () => {
    test.skip(!process.env.DATABASE_URL, "needs the database to seed a ready automation");
    const [row] = await neon(process.env.DATABASE_URL!)`
      insert into automations (workspace_id, name, command, description, input_label, input_hint, input_example, template, status, version, approved_at)
      values ('demo-workspace', '[e2e] Company facts', ${command}, 'Writes three facts about a company.', 'Company name', 'e.g. Apple Inc.',
              'Acme Ltd', ${JSON.stringify(template)}::jsonb, 'active', 1, now())
      returning id`;
    readyId = row.id as string;
  });

  test.afterAll(async () => {
    if (readyId && process.env.DATABASE_URL) await neon(process.env.DATABASE_URL)`delete from automations where id = ${readyId}`;
  });

  test("offers one Run with its example, Turn off with what it does, and a schedule in local time or a plain note", async ({ page }) => {
    await page.goto(`/automations/${readyId}`);

    // Q106: one primary action, its input labelled and the example filled in; Turn off says what it does
    await expect(page.getByLabel("Company name", { exact: true })).toHaveValue("Acme Ltd");
    await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
    await expect(page.getByText(/Nothing is deleted/)).toBeVisible();
    await expect(page.getByText(`/${command}`).first()).toBeVisible(); // how it is called: the front slash
    await expect(page.locator("main")).not.toContainText(`\\${command}`);

    // Q84: without a scheduler the page says so and promises no next run; with one, Q107 and Q120
    const notHere = page.getByText(/Scheduled runs are not switched on here/);
    if (await notHere.isVisible()) {
      await expect(page.getByText(/Next run/)).toHaveCount(0);
      return;
    }
    await page.getByLabel("How often").selectOption("weekdays");
    await page.getByLabel("At", { exact: true }).fill("08:00");
    await expect(page.getByLabel("Company name for scheduled runs")).toHaveValue("Acme Ltd"); // Q107: the example prefilled
    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(page.getByText("Schedule saved.")).toBeVisible(); // Q120: the confirmation survives the save
    await expect(page.getByText(/Every weekday at 08:00/)).toBeVisible(); // shown in the schedule's zone, the viewer's own here
    const [stored] = await neon(process.env.DATABASE_URL!)`select schedule, schedule_input, schedule_tz from automations where id = ${readyId}`;
    expect(stored).toEqual({ schedule: "0 8 * * 1-5", schedule_input: "Acme Ltd", schedule_tz: "Europe/Prague" }); // 08:00 in the zone it was set in
  });

  // UX R2: an automation that is off has no Run above and cannot be called from Home, so its empty history says neither
  test("once turned off, its empty history says only that there are no runs", async ({ page }) => {
    await neon(process.env.DATABASE_URL!)`update automations set status = 'disabled' where id = ${readyId}`;
    await page.goto(`/automations/${readyId}`);
    await expect(page.getByText("No runs yet.", { exact: true })).toBeVisible();
    await expect(page.getByText(/call it from Home/)).toHaveCount(0);
  });

  // UX QA U5 and U14: every tab read "Handover", and a missing automation had no way on but the small back link
  test("the gallery and an automation are named in the tab, and a missing automation leads back to the gallery", async ({ page }) => {
    await page.goto("/automations");
    await expect(page).toHaveTitle("Automations - Handover");
    await page.goto(`/automations/${readyId}`);
    await expect(page).toHaveTitle("[e2e] Company facts - Handover");
    await page.goto("/automations/new");
    await expect(page).toHaveTitle("New automation - Handover");

    await page.goto("/automations/00000000-0000-0000-0000-000000000000");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("That automation was not found");
    await expect(page).toHaveTitle("Not found - Handover");
    await page.getByRole("link", { name: "Back to automations" }).last().click();
    await expect(page).toHaveURL(/\/automations$/);
  });

  // UX R2: Delete asked with the browser's own confirm; now the same paper sheet as the Members page's Remove
  test("Delete asks on a sheet naming the automation and that its command stops working, then opens the gallery", async ({ page }) => {
    await page.goto(`/automations/${readyId}`);
    await page.getByRole("button", { name: "Delete" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toContainText('Delete "[e2e] Company facts"?');
    await expect(sheet).toContainText(`/${command} stops working`);
    await sheet.getByRole("button", { name: "Cancel" }).click(); // Cancel leaves it where it is
    await expect(sheet).toHaveCount(0);

    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(/\/automations$/);
    const [left] = await neon(process.env.DATABASE_URL!)`select count(*)::int as n from automations where id = ${readyId}`;
    expect(left.n).toBe(0);
  });
});

// UX QA U32: on a phone a draft's "Try it" (its examples and the approval) came after the whole brief, output and
// steps, about 1,500 px down, while approving is a draft's next step. Seeded ("[e2e]", deleted in afterAll): a draft
// and a ready automation, no run.
test.describe("where Try it sits", () => {
  const stamp = Date.now().toString(36);
  const template = {
    instructions: "Write facts.md with three facts about {input}.",
    intent: "Writes three facts about a company.",
    expectedOutputs: ["facts.md with three facts about {input}"],
    outputFormat: "",
    steps: ["Find three facts about {input}", "Write facts.md"],
    connections: [],
  };
  const ids: string[] = [];
  let draftId = "";
  let readyId = "";

  test.beforeAll(async () => {
    const seed = async (command: string, status: "draft" | "active") => {
      const [row] = await sql()`
        insert into automations (workspace_id, name, command, description, input_label, input_hint, input_example, template, status, version, approved_at)
        values ('demo-workspace', ${`[e2e] Try it ${status}`}, ${command}, 'Writes three facts about a company.', 'Company name', 'e.g. Apple Inc.',
                'Acme Ltd', ${JSON.stringify(template)}::jsonb, ${status}, 1, ${status === "active" ? new Date() : null})
        returning id`;
      ids.push(row.id as string);
      return row.id as string;
    };
    draftId = await seed(`e2e-tryit-d-${stamp}`, "draft");
    readyId = await seed(`e2e-tryit-r-${stamp}`, "active");
  });

  test.afterAll(async () => {
    if (ids.length) await sql()`delete from automations where id = any(${ids})`;
  });

  const top = async (page: Page, name: string) => (await page.getByRole("heading", { name, exact: true }).boundingBox())!;

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("a draft's Try it comes right under the header, before the brief", async ({ page }) => {
      await page.goto(`/automations/${draftId}`);
      const [title, tryIt, brief] = [await top(page, "[e2e] Try it draft"), await top(page, "Try it"), await top(page, "The brief")];
      expect(title.y).toBeLessThan(tryIt.y);
      expect(tryIt.y).toBeLessThan(brief.y);
      const approve = (await page.getByRole("button", { name: "Approve and save" }).boundingBox())!; // the approval came up with it
      expect(approve.y).toBeLessThan(brief.y);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth); // nothing sticks out sideways
    });

    test("a ready automation keeps its order: Run and its runs first, Try it after the brief", async ({ page }) => {
      await page.goto(`/automations/${readyId}`);
      const [runs, brief, tryIt] = [await top(page, "Its runs"), await top(page, "The brief"), await top(page, "Try it")];
      expect(runs.y).toBeLessThan(brief.y);
      expect(brief.y).toBeLessThan(tryIt.y);
    });
  });

  test("on a desk a draft's Try it stays in the column beside the document", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/automations/${draftId}`);
    const [brief, tryIt] = [await top(page, "The brief"), await top(page, "Try it")];
    expect(tryIt.x).toBeGreaterThan(brief.x + brief.width);
  });
});
