import { expect, test } from "@playwright/test";
import { DEMO_STATE, SIGNED_OUT, asNewClient, deleteUsers, e2eEmail, signUpThroughUi } from "./auth-helpers";

// One workspace cannot read another's runs, through the page or the API. Local only (it creates an account):
// BASE_URL=http://localhost:3004 npx playwright test e2e/tenancy.spec.ts
test.use({ storageState: SIGNED_OUT });
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(asNewClient())); // a client of its own: the sign-up limit

const created: string[] = [];
test.afterAll(async () => deleteUsers(created));

type RunSummary = { id: string; prompt: string };

// A run of the demo workspace, read the way the demo user reads it.
async function demoRun(browser: import("@playwright/test").Browser) {
  const demo = await browser.newContext({ storageState: DEMO_STATE });
  try {
    const res = await demo.request.get("/api/runs");
    expect(res.status()).toBe(200);
    const { runs } = (await res.json()) as { runs: RunSummary[] };
    expect(runs.length, "the demo workspace needs a seeded run: npm run seed").toBeGreaterThan(0);
    const run = runs[0];
    const detail = (await (await demo.request.get(`/api/runs/${run.id}`)).json()) as { files: { name: string }[] };
    return { ...run, fileName: detail.files[0]?.name ?? null };
  } finally {
    await demo.close();
  }
}

test("a new user opening a demo workspace run sees 'not found', and the API answers 404", async ({ browser, page }) => {
  const run = await demoRun(browser);
  const email = e2eEmail("tenancy");
  created.push(email);
  await signUpThroughUi(page, "Tess Stranger", email);

  await page.goto(`/?run=${run.id}`);
  await expect(page.getByText(/not found/i)).toBeVisible();
  await expect(page.getByText(run.prompt, { exact: true })).toHaveCount(0);

  const api = await page.request.get(`/api/runs/${run.id}`);
  expect(api.status()).toBe(404);

  if (run.fileName) {
    const download = await page.request.get(`/api/runs/${run.id}/files/${encodeURIComponent(run.fileName)}`);
    expect(download.status()).toBe(404);
  }
});

test("a new user's run list is empty, not the demo workspace's", async ({ page }) => {
  const email = e2eEmail("empty");
  created.push(email);
  await signUpThroughUi(page, "Ned Newcomer", email);
  const res = await page.request.get("/api/runs");
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { runs: unknown[] }).runs).toEqual([]);
});
