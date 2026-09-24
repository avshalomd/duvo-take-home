import { expect, test } from "@playwright/test";
import { SIGNED_OUT, deleteUsers, e2eEmail, signedInAs, sql } from "./auth-helpers";

// The content policies on real responses (the unit tests check the config and the route's headers each on their own,
// which is how F8 slipped through: next.config's header replaced the chart's). Local only: it creates an account and a
// run row; both are deleted after. BASE_URL=http://localhost:3004 npx playwright test e2e/headers.spec.ts
test.use({ storageState: SIGNED_OUT });

const created: string[] = [];
const runIds: string[] = [];
test.afterAll(async () => {
  const db = sql();
  if (runIds.length) {
    await db`delete from files where run_id = any(${runIds})`;
    await db`delete from model_spend where run_id = any(${runIds})`;
    await db`delete from runs where id = any(${runIds})`;
  }
  await deleteUsers(created);
});

test("a page carries the app's content policy: no framing, no plugins, no <base>, scripts from the app only", async ({ request }) => {
  const res = await request.get("/sign-in");
  const policy = res.headers()["content-security-policy"];
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("script-src 'self' 'unsafe-inline'");
});

test("a chart shown in the page keeps its own no-script, sandboxed policy, which also forbids framing (F8)", async ({ playwright, browser, baseURL }) => {
  const email = e2eEmail("svg-policy");
  created.push(email);
  const { context, page } = await signedInAs(playwright.request, browser, baseURL!, "Sven Svg", email);
  try {
    const db = sql();
    const [run] = await db`
      insert into runs (workspace_id, prompt, status, model, finished_at)
      select m.organization_id, '[e2e] chart policy', 'succeeded', 'e2e', now()
      from member m join "user" u on u.id = m.user_id where u.email = ${email} and m.role = 'owner'
      returning id`;
    runIds.push(run.id as string);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    await db`insert into files (run_id, name, mime, bytes, content) values (${run.id}, 'chart.svg', 'image/svg+xml', ${svg.length}, ${svg})`;

    const res = await page.request.get(`/api/runs/${run.id}/files/chart.svg?inline=1`);

    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/svg+xml");
    expect(res.headers()["content-security-policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
  } finally {
    await context.close();
  }
});
