import { neon } from "@neondatabase/serverless";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DEMO_EMAIL, E2E_PASSWORD, SIGNED_OUT, deleteUsers, e2eEmail, inviteByRow } from "./auth-helpers";

// Q178: who may do what with an automation, in the browser. A plain member of the demo workspace sees approval, Turn
// off, Delete and the schedule as plain lines saying who does them, and keeps Edit, Run example and Run; the demo user
// (the owner) still gets the controls. No agent run: a draft and a ready automation are seeded ("[e2e]"), and they and
// the member are deleted in afterAll. Local only (it creates an account):
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
  await expect(page.getByTestId("approve-reason")).toHaveText("An owner or an admin approves it once an example looks right.");
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByText("An owner or an admin can delete it.")).toBeVisible();
});

test("a member can run a ready automation, and sees its switch, schedule and delete as lines saying who does them", async () => {
  const page = await asMember(`/automations/${readyId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(READY);

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

test("the owner still gets Approve, Turn off, Delete and the schedule form on the same automations", async ({ page }) => {
  await page.goto(`/automations/${draftId}`);
  await expect(page.getByRole("button", { name: "Approve and save" })).toBeVisible(); // disabled until an example looks right
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByText(/An owner or an admin/)).toHaveCount(0);

  await page.goto(`/automations/${readyId}`);
  await expect(page.getByRole("button", { name: "Turn off" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();
  await expect(page.getByText(/An owner or an admin/)).toHaveCount(0);
  if (await schedulerOff(page)) return;
  await expect(page.getByRole("button", { name: "Save schedule" })).toBeVisible();
});
