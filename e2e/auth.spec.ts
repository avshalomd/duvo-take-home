import { expect, test, type Page } from "@playwright/test";
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  E2E_PASSWORD,
  SIGNED_OUT,
  asNewClient,
  closeInvitation,
  deleteUsers,
  e2eEmail,
  formError,
  inviteByRow,
  signInThroughUi,
  signUpThroughUi,
} from "./auth-helpers";

// Getting in and out. Local only (it creates accounts):
// BASE_URL=http://localhost:3004 npx playwright test e2e/auth.spec.ts
test.use({ storageState: SIGNED_OUT });
// every test its own client, so the suite's many sign-ins stay under the per-client limit (asNewClient)
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(asNewClient()));

const created: string[] = [];
test.afterAll(async () => deleteUsers(created));

// The example is drawn at two sizes and CSS shows the one for the screen's width: test the one on screen.
const visibleThread = (page: Page) => page.getByTestId("thread").filter({ visible: true });

test("signing up creates a personal workspace and lands on Home", async ({ page }) => {
  const email = e2eEmail("signup");
  created.push(email);
  await signUpThroughUi(page, "Erin Tester", email);
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toContainText("Erin's workspace");
});

// Q110: the way to sign in is a link, and it brings the email along.
test("signing up with an email that already has an account links to sign-in with the email filled in", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Someone Else");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("another-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toContainText("There is already an account with that email.");
  await formError(page).getByRole("link", { name: "Sign in instead" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("email") === DEMO_EMAIL);
  await expect(page.getByLabel("Email")).toHaveValue(DEMO_EMAIL);
});

test("sign-in sets the example thread beside the form, and it draws itself through to done", async ({ page }) => {
  await page.goto("/sign-in");
  const thread = visibleThread(page);
  const email = page.getByLabel("Email");
  await expect(thread).toBeVisible();
  const [t, f] = [await thread.boundingBox(), await email.boundingBox()];
  expect(t!.x + t!.width).toBeLessThanOrEqual(f!.x); // left of the form, not above it
  await expect(thread.getByText("Done", { exact: true })).toHaveCount(3, { timeout: 10_000 });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the example thread shrinks to a strip above the form, and nothing sticks out sideways", async ({ page }) => {
    await page.goto("/sign-in");
    const [t, f] = [await visibleThread(page).boundingBox(), await page.getByLabel("Email").boundingBox()];
    expect(t!.y + t!.height).toBeLessThanOrEqual(f!.y);
    expect(t!.height).toBeLessThanOrEqual(120); // a strip, not the desktop illustration
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  // Q113: the phone's top bar has room for one name; it is the workspace's, because that is what the page shows.
  test("the user menu names the current workspace", async ({ page }) => {
    await page.goto("/sign-in");
    await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
    await page.waitForURL((url) => url.pathname === "/");
    const trigger = page.getByTestId("app-header").getByRole("button", { name: /Demo/ });
    const box = await trigger.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(390); // the trigger fits: no clipped name or chevron
    await trigger.click();
    // the top of the menu says which workspace this is, readable (not truncated away), and who is signed in
    await expect(page.getByTestId("menu-workspace")).toHaveText("Demo workspace");
    await expect(page.getByTestId("menu-workspace")).toBeInViewport();
    await expect(page.getByRole("menu")).toContainText(DEMO_EMAIL);
  });
});

test("a wrong password shows the error and stays on the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, "not-the-password");
  await expect(formError(page)).toHaveText("That email and password do not match.");
  await expect(page).toHaveURL(/\/sign-in/);
});

// Q176: 3 sign-in tries per 10 s per client, counted in the database. This test's browser is one client (beforeEach).
test("the fourth wrong password in a row says to wait, and another browser can still try", async ({ page, browser }) => {
  const tryToSignIn = async (p: Page) => {
    const answered = p.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email"));
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    return (await answered).status();
  };
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password"); // the form keeps both between tries
  for (let i = 0; i < 3; i++) expect(await tryToSignIn(page)).toBe(401);
  expect(await tryToSignIn(page)).toBe(429);
  await expect(formError(page)).toHaveText("Too many tries. Wait a few seconds, then try again.");

  const other = await browser.newContext({ storageState: SIGNED_OUT, extraHTTPHeaders: asNewClient() });
  try {
    const elsewhere = await other.newPage();
    await elsewhere.goto("/sign-in");
    await signInThroughUi(elsewhere, DEMO_EMAIL, "not-the-password");
    await expect(formError(elsewhere)).toHaveText("That email and password do not match.");
  } finally {
    await other.close();
  }
});

test("the sign-in pages carry the product's name, Handover", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page).toHaveTitle("Sign in - Handover");
  await expect(page.getByRole("region", { name: "What Handover does" })).toContainText("Handover");
});

// Security QA: another site could frame the app (clickjacking).
test("pages and the API tell the browser they may not be framed, and do not name the framework", async ({ page, request }) => {
  const res = await page.goto("/sign-in");
  const pageHeaders = res!.headers();
  const apiHeaders = (await request.get("/api/runs", { maxRedirects: 0 })).headers();
  for (const h of [pageHeaders, apiHeaders]) {
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'"); // the rest of the policy: headers.spec.ts (S13)
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-powered-by"]).toBeUndefined();
  }
});

test("a signed-out visit to / goes to /sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("signing in returns to the page that was asked for", async ({ page }) => {
  await page.goto("/automations");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fautomations/);
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL((url) => url.pathname === "/automations");
});

// Q130: the cookie is there (so the proxy lets the request through) but no session matches it.
test("a stale session cookie on a deep link still returns there after signing in", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "better-auth.session_token", value: "e2e-stale.token", url: baseURL! }]);
  await page.goto("/automations?tab=mine");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.searchParams.get("next") === "/automations?tab=mine");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL((url) => url.pathname === "/automations" && url.searchParams.get("tab") === "mine");
});

test("a signed-out API call answers 401, not a redirect to a page", async ({ request }) => {
  const res = await request.get("/api/runs", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test("signing out from the user menu ends the session", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Demo/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await page.goto("/");
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
});

test("an invitation link lets a new person create an account and join the workspace", async ({ browser, page }) => {
  const owner = e2eEmail("owner");
  const invitee = e2eEmail("invitee");
  created.push(owner, invitee);
  await signUpThroughUi(page, "Olga Owner", owner);
  const invitationId = await inviteByRow(owner, invitee);

  const guest = await browser.newContext({ storageState: SIGNED_OUT, extraHTTPHeaders: asNewClient() });
  try {
    const guestPage = await guest.newPage();
    await guestPage.goto(`/invite/${invitationId}`);
    await expect(guestPage.getByRole("heading", { name: "Join Olga's workspace" })).toBeVisible();
    await expect(guestPage.getByText(`Olga Owner invited ${invitee}`)).toBeVisible();

    await guestPage.getByRole("link", { name: "Create an account" }).click();
    await expect(guestPage.getByLabel("Email")).toHaveValue(invitee); // the address the invitation was sent to
    await guestPage.getByLabel("Your name").fill("Ivan Invitee");
    await guestPage.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await guestPage.getByRole("button", { name: "Create account" }).click();

    await expect(guestPage).toHaveURL((url) => url.pathname === `/invite/${invitationId}`);
    await guestPage.getByRole("button", { name: "Join Olga's workspace" }).click();
    await expect(guestPage).toHaveURL((url) => url.pathname === "/");
    await expect(guestPage.getByTestId("app-header")).toContainText("Olga's workspace");
  } finally {
    await guest.close();
  }
});

// Security QA: a plain member could read pending invitations' ids from Better Auth's API, then sign up as the invited
// address and accept one as an admin. Ids go to owners and admins only, over HTTP as in the pages.
test("Better Auth's API hands a plain member no invitation ids, and still hands them to the owner", async ({ playwright, baseURL }) => {
  const owner = e2eEmail("ids-owner");
  const plain = e2eEmail("ids-member");
  const pending = e2eEmail("ids-pending");
  created.push(owner, plain, pending);
  const asOwner = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, ...asNewClient() } });
  const asMember = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL!, ...asNewClient() } });
  try {
    await expect(await asOwner.post("/api/auth/sign-up/email", { data: { name: "Oona Owner", email: owner, password: E2E_PASSWORD } })).toBeOK();
    const joining = await inviteByRow(owner, plain);
    const pendingId = await inviteByRow(owner, pending);
    await expect(await asMember.post("/api/auth/sign-up/email", { data: { name: "Pia Plain", email: plain, password: E2E_PASSWORD } })).toBeOK();
    await expect(await asMember.post("/api/auth/organization/accept-invitation", { data: { invitationId: joining } })).toBeOK();

    expect((await asMember.get("/api/auth/organization/list-invitations")).status()).toBe(403);
    const full = await asMember.get("/api/auth/organization/get-full-organization");
    await expect(full).toBeOK();
    expect((await full.json()).invitations).toEqual([]);
    expect(await full.text()).not.toContain(pendingId);

    const forOwner = await asOwner.get("/api/auth/organization/list-invitations");
    expect((await forOwner.json()).map((i: { id: string }) => i.id)).toContain(pendingId);
  } finally {
    await asOwner.dispose();
    await asMember.dispose();
  }
});

test("an unknown invitation link says it was not found, not that it closed (production QA, 2026-09-23)", async ({ page }) => {
  await page.goto("/invite/e2e-no-such-invitation");
  await expect(page.getByRole("heading", { name: "We could not find this invitation" })).toBeVisible();
  // UX QA: signed out there is no workspace to go to; the way on is to sign in
  await expect(page.getByRole("link", { name: "Go to your workspace" })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
});

test("a used invitation's link, opened signed out, offers to sign in rather than a workspace", async ({ page }) => {
  const owner = e2eEmail("closed-owner");
  const invitee = e2eEmail("closed-invitee");
  created.push(owner, invitee);
  await signUpThroughUi(page, "Carl Closed", owner);
  const invitationId = await inviteByRow(owner, invitee);
  await page.context().clearCookies(); // the invitee's browser, signed out
  await closeInvitation(invitationId);

  await page.goto(`/invite/${invitationId}`);
  await expect(page.getByRole("heading", { name: "This invitation is closed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  await expect(page.getByRole("link", { name: "Go to your workspace" })).toHaveCount(0);
});

test("an unknown invitation link, opened signed in, still offers the way back to the workspace", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.goto("/invite/e2e-no-such-invitation");
  await expect(page.getByRole("link", { name: "Go to your workspace" })).toBeVisible();
});

test("a new workspace made from the user menu opens at once, and the menu switches back", async ({ page }) => {
  const email = e2eEmail("switcher");
  created.push(email);
  await signUpThroughUi(page, "Sam Switcher", email);
  const header = page.getByTestId("app-header");

  await header.getByRole("button", { name: /Sam Switcher/ }).click();
  await page.getByRole("menuitem", { name: "New workspace" }).click();
  await page.getByLabel("Name").fill("E2e finance team");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(header).toContainText("E2e finance team");
  // Home streams in after the top bar, and its empty-state composer takes focus when it appears, which closes a
  // menu opened before it: wait for Home's question, as a person would see the page finish loading.
  await expect(page.getByRole("heading", { name: "What should the agent do?" })).toBeVisible();

  await header.getByRole("button", { name: /Sam Switcher/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "E2e finance team" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("menuitemradio", { name: "Sam's workspace" }).click();
  await expect(header).toContainText("Sam's workspace");
});

test("the user menu lists the workspaces with the active one ticked", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("button", { name: /Demo/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Demo workspace" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitem", { name: "New workspace" })).toBeVisible();
});
