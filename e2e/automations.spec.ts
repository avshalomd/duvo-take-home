import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

// The automation builder, from a seeded finished run to a draft that cannot be approved yet. Run against a local
// dev server with the database's URL in the environment (for the clean-up):
//   npx dotenv -e .env.local -- env BASE_URL=http://localhost:3002 npx playwright test e2e/automations.spec.ts
// It makes one real, cheap LLM call (the draft) and starts no agent run. The draft is renamed "[e2e] ..." and
// deleted through the page; afterAll deletes it by id as well, in case the test stopped half-way.

const SOURCE_RUN = /What is the difference between an LLM agent and a workflow/; // seeded, finished, no files: the cheapest draft
let createdId: string | null = null;

// After the auth package lands every page asks for a sign-in; the seeded demo user is local-only.
async function open(page: Page, path: string) {
  await page.goto(path);
  if (!page.url().includes("/sign-in")) return;
  await page.getByLabel(/email/i).fill("demo@example.com");
  await page.getByLabel(/password/i).fill("demo-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  await page.goto(path);
}

test.afterAll(async () => {
  if (!createdId || !process.env.DATABASE_URL) return;
  await neon(process.env.DATABASE_URL)`delete from automations where id = ${createdId}`;
});

test("a finished run becomes a draft automation that can be edited and cannot be approved before an example", async ({ page }) => {
  test.setTimeout(120_000); // the draft is a real model call

  await open(page, "/automations");
  await page.getByRole("button", { name: "New from a run" }).click();
  await page.getByRole("dialog").getByRole("link", { name: SOURCE_RUN }).first().click();

  // the loading state is real: the draft is written by a model while the page waits
  await expect(page.getByText("Drafting an automation from this run...")).toBeVisible();
  await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 90_000 });
  createdId = new URL(page.url()).pathname.split("/").pop() ?? null;

  // the draft arrives filled in: the instructions carry the {input} placeholder
  await expect(page.getByLabel("Instructions")).toHaveValue(/\{input\}/);

  // edit a field and save it: the value survives a reload
  const name = `[e2e] Agent or workflow ${Date.now()}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(name);

  // no example has run, so approval is disabled and the page says why
  await expect(page.getByRole("button", { name: "Approve and save" })).toBeDisabled();
  await expect(page.getByTestId("approve-reason")).toHaveText(/run an example/i);

  // the first example's input is offered from the run the draft came from
  await expect(page.getByLabel("Example input")).not.toHaveValue("");

  // clean up through the page, which is also the proof that Delete works
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/automations$/);
  await expect(page.getByText(name)).toHaveCount(0);
});
