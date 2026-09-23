import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

// The automation builder, from a seeded finished run to a draft that cannot be approved yet. Signed in as the demo
// user by the "setup" project (e2e/auth.setup.ts). Run against a local dev server with the database's URL in the
// environment (for the clean-up):
//   npx dotenv -e .env.local -- env BASE_URL=http://localhost:3002 npx playwright test e2e/automations.spec.ts
// It makes one real, cheap LLM call (the draft) and starts no agent run. The draft is renamed "[e2e] ..." and
// deleted through the page; afterAll deletes it by id as well, in case the test stopped half-way.

const SOURCE_RUN = /What is the difference between an LLM agent and a workflow/; // seeded, finished, no files: the cheapest draft
let createdId: string | null = null;

test.afterAll(async () => {
  if (!createdId || !process.env.DATABASE_URL) return;
  await neon(process.env.DATABASE_URL)`delete from automations where id = ${createdId}`;
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
  await expect(page.getByText(name)).toBeVisible();

  // no example has run, so approval is disabled and the bar says why
  await expect(page.getByRole("button", { name: "Approve and save" })).toBeDisabled();
  await expect(page.getByTestId("approve-reason")).toHaveText(/run an example/i);

  // the first example's input is offered from the run the draft came from
  await expect(page.getByLabel("Example input")).not.toHaveValue("");

  // Q118: the gallery never shows the raw placeholder
  await page.goto("/automations");
  await expect(page.getByTestId("gallery")).toBeVisible();
  await expect(page.getByTestId("gallery")).not.toContainText("{input}");
  // commands are shown with the front slash only (his call), never a backslash
  await expect(page.getByTestId("gallery")).toContainText("/");
  await expect(page.getByTestId("gallery")).not.toContainText("\\");

  // clean up through the page, which is also the proof that Delete works
  await page.goto(`/automations/${createdId}`);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/automations$/);
  await expect(page.getByText(name)).toHaveCount(0);
});

// A ready automation needs an approved example, which is a real agent run: this one is seeded straight into the
// table instead ("[e2e]", deleted in afterAll), so the ready page can be checked without spending a run.
test.describe("a ready automation", () => {
  test.use({ timezoneId: "Europe/Prague" }); // 08:00 there is 06:00 UTC in September: the schedule's conversion is visible
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
    await expect(page.getByText(/Every weekday at 08:00/)).toBeVisible(); // shown in the viewer's time
    const [stored] = await neon(process.env.DATABASE_URL!)`select schedule, schedule_input from automations where id = ${readyId}`;
    expect(stored).toEqual({ schedule: "0 6 * * 1-5", schedule_input: "Acme Ltd" }); // kept in UTC for the scheduler
  });
});
