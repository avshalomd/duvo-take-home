import { neon } from "@neondatabase/serverless";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DEMO_EMAIL, E2E_PASSWORD, SIGNED_OUT, deleteUsers, e2eEmail, inviteByRow } from "./auth-helpers";

// Q178: who may do what with an automation, in the browser. A plain member of the demo workspace sees approval, Turn
// off, Delete and the schedule as plain lines saying who does them, and keeps Edit, Run example and Run; the demo user
// (the owner) still gets the controls. A member reads an approved automation's command but cannot rename it, and a
// judgment says who made it. No agent run: a draft with one finished example and a ready automation are seeded
// ("[e2e]"), and they and the member are deleted in afterAll. Local only (it creates an account):
//   BASE_URL=http://localhost:3006 npx playwright test e2e/automations-roles.spec.ts
test.use({ timezoneId: "Europe/Prague" }); // the seeded schedule's zone, so it reads without a zone name

function sql() {
  if (!process.env.DATABASE_URL) process.loadEnvFile(".env.local"); // the dev server under test reads the same file
  return neon(process.env.DATABASE_URL!);
}

const stamp = Date.now().toString(36);
const DRAFT = `[e2e] Roles draft ${stamp}`;
const READY = `[e2e] Roles ready ${stamp}`;
const template = {
  instructions: "Write facts.md with three facts about {input}.",
  intent: "Writes three facts about a company.",
  expectedOutputs: ["facts.md with three facts about {input}"],
  outputFormat: "",
  steps: ["Find three facts about {input}", "Write facts.md"],
  connections: [],
};
const memberEmail = e2eEmail("automations-member");
let draftId = "";
let readyId = "";
let trialId = "";
let member: BrowserContext | null = null;

async function seed(name: string, command: string, ready: boolean): Promise<string> {
  const [row] = await sql()`
    insert into automations (workspace_id, name, command, description, input_label, input_hint, input_example, template, status, version, approved_at,
                             schedule, schedule_input, schedule_tz, next_run_at)
    values ('demo-workspace', ${name}, ${command}, 'Writes three facts about a company.', 'Company name', 'e.g. Apple Inc.', 'Acme Ltd',
            ${JSON.stringify(template)}::jsonb, ${ready ? "active" : "draft"}, 1, ${ready ? new Date() : null},
            ${ready ? "0 8 * * 1-5" : null}, ${ready ? "Acme Ltd" : null}, ${ready ? "Europe/Prague" : null},
            ${ready ? new Date(Date.now() + 7 * 86_400_000) : null}) -- a week out: nothing fires while the spec runs
    returning id`;
  return row.id as string;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  draftId = await seed(DRAFT, `e2e-roles-d-${stamp}`, false);
  readyId = await seed(READY, `e2e-roles-r-${stamp}`, true);
  // one finished example of the draft, not judged yet: the member judges it below (no agent run)
  const [trial] = await sql()`
    insert into runs (workspace_id, created_by, prompt, status, model, purpose, report, automation_id, automation_version, input, finished_at)
    values ('demo-workspace', 'demo-user', '[e2e] roles example: facts about Acme Ltd', 'succeeded', 'e2e', 'trial', 'Three facts about Acme Ltd.',
            ${draftId}, 1, 'Acme Ltd', now())
    returning id`;
  trialId = trial.id as string;

  // the member joins the demo workspace the way a person does: invited, then an account made from the invitation's page
  const invitationId = await inviteByRow(DEMO_EMAIL, memberEmail);
  member = await browser.newContext({ storageState: SIGNED_OUT });
  const page = await member.newPage();
  await page.goto(`/invite/${invitationId}`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("e2e Mia Member");
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: /^Join / }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.close();
});

test.afterAll(async () => {
  await member?.close();
  if (trialId) await sql()`delete from runs where id = ${trialId}`;
  await sql()`delete from automations where id = any(${[draftId, readyId].filter(Boolean)})`;
  await deleteUsers([memberEmail]);
});

async function asMember(path: string): Promise<Page> {
  const page = await member!.newPage();
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page;
}

// Locally no scheduler runs unless CRON_SECRET is set; then the page says so to everyone and shows no schedule form.
const schedulerOff = (page: Page) => page.getByText(/Scheduled runs are not switched on here/).isVisible();

test("a member can edit a draft and run an example, and is told who approves and deletes it", async () => {
  const page = await asMember(`/automations/${draftId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(DRAFT);

  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run example" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Approve and save" })).toHaveCount(0);
  // the next step the owner is given too: running, judging and changing it are the member's as well (UX R2)
  await expect(page.getByTestId("approve-reason")).toHaveText("Check the example's result and mark it as looks right.");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByText("An owner or an admin can delete it.")).toBeVisible();

  // a draft's command is anyone's to change
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Command", { exact: true })).toBeEditable();
});

test("a member can run a ready automation, and sees its switch, schedule and delete as lines saying who does them", async () => {
  const page = await asMember(`/automations/${readyId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(READY);

  // people call it by its command, so a member edits the rest of it but reads the command
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Command", { exact: true })).not.toBeEditable();
  await expect(page.getByLabel("Command", { exact: true })).toHaveValue(`e2e-roles-r-${stamp}`);
  await expect(page.getByLabel("Command", { exact: true })).toHaveCSS("cursor", "default"); // read, not typed into (UX R2)
  await expect(page.getByText("People call it by this command, so an owner or an admin changes it.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeEditable();
  // beside Save, what a save of the brief does to the command people call (UX R2)
  await expect(page.getByText(`Saving a change to the brief takes /e2e-roles-r-${stamp} out of use until an owner or an admin approves it.`)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn off" })).toHaveCount(0);
  await expect(page.getByText("An owner or an admin can turn it off.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByText("An owner or an admin can delete it.")).toBeVisible();

  if (await schedulerOff(page)) return;
  await expect(page.getByText(/Every weekday at 08:00, with "Acme Ltd"/)).toBeVisible(); // the schedule, read-only
  await expect(page.getByRole("button", { name: "Save schedule" })).toHaveCount(0);
  await expect(page.getByLabel("How often")).toHaveCount(0);
  await expect(page.getByText("An owner or an admin sets its schedule.")).toBeVisible();
});

test("a member judges an example; they read 'You said', and the owner reads the member's name, here and on Home", async ({ page }) => {
  const mine = await asMember(`/automations/${draftId}`);
  const example = mine.getByTestId("example").filter({ hasText: "Acme Ltd" });
  await example.getByRole("button", { name: "Looks right" }).click();
  await expect(example).toContainText("You said it looks right");
  await expect(example.getByRole("button", { name: "Change" })).toBeVisible(); // their own: changing it replaces no one's
  await expect(mine.getByTestId("approve-reason")).toHaveText("An owner or an admin approves it.");

  await page.goto(`/automations/${draftId}`);
  const theirs = page.getByTestId("example").filter({ hasText: "Acme Ltd" });
  await expect(theirs).toContainText("e2e Mia Member said it looks right");
  await expect(theirs.getByRole("button", { name: "Replace e2e Mia Member's judgment" })).toBeVisible(); // UX R2: whose it replaces
  await expect(page.getByText("You said it looks right")).toHaveCount(0);

  await page.goto(`/?run=${trialId}`);
  await expect(page.getByTestId("run-panel")).toContainText("e2e Mia Member said it looks right");
});

test("the owner still gets Approve, Turn off, Delete and the schedule form on the same automations", async ({ page }) => {
  await page.goto(`/automations/${draftId}`);
  await expect(page.getByRole("button", { name: "Approve and save" })).toBeVisible(); // disabled until an example looks right
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByText(/An owner or an admin/)).toHaveCount(0);

  await page.goto(`/automations/${readyId}`);
  await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByText(/An owner or an admin/)).toHaveCount(0);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Command", { exact: true })).toBeEditable(); // the owner may rename a ready one
  await expect(page.getByText(/out of use until an owner or an admin/)).toHaveCount(0); // they approve it themselves
  await page.getByRole("button", { name: "Cancel" }).click();
  if (await schedulerOff(page)) return;
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeVisible();
});
