import { expect, test } from "@playwright/test";
import { DEMO_EMAIL, DEMO_PASSWORD, E2E_PASSWORD, SIGNED_OUT, asNewClient, deleteUsers, e2eEmail, formError, inviteByRow, signInThroughUi } from "./auth-helpers";

// Sign-up by invitation only, as production runs. The same variable starts the server in that mode and turns
// these tests on (they skip in the default open mode, where auth.spec.ts signs people up freely). Next runs one dev
// server per folder, so serve a second checkout (git worktree add) on a port Better Auth trusts (3000-3010):
//   SIGNUP_MODE=invite npx next dev -p 3004
//   SIGNUP_MODE=invite BASE_URL=http://localhost:3004 npx playwright test e2e/auth-invite-only.spec.ts
test.skip(process.env.SIGNUP_MODE !== "invite", "run with SIGNUP_MODE=invite, against a server started the same way");
test.use({ storageState: SIGNED_OUT });
test.beforeEach(async ({ context }) => context.setExtraHTTPHeaders(asNewClient())); // a client of its own: the sign-in limit

const INVITE_ONLY = "Handover is invite-only. Open your invitation link, or ask someone in a workspace to invite you.";
const created: string[] = [];
test.afterAll(async () => deleteUsers(created));

test("/sign-up without an invitation says Handover is invite-only and offers sign-in, with no form", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByText(INVITE_ONLY)).toBeVisible();
  await expect(page.getByLabel("Your name")).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0); // sign-in does not offer it either
});

test("the API refuses a sign-up without an invitation too, and no account is made", async ({ request, baseURL }) => {
  const email = e2eEmail("api-uninvited");
  created.push(email);
  const res = await request.post("/api/auth/sign-up/email", {
    data: { name: "Api Uninvited", email, password: E2E_PASSWORD },
    headers: { origin: baseURL!, ...asNewClient() },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("SIGNUP_INVITE_ONLY");
  const signIn = await request.post("/api/auth/sign-in/email", { data: { email, password: E2E_PASSWORD }, headers: { origin: baseURL!, ...asNewClient() } });
  expect(signIn.status()).toBe(401);
});

// Security QA: an invited address alone was enough to make its account (and then take the invitation). The sign-up
// must come from the invitation's link: its page leaves the invitation in a cookie the sign-up request carries.
test("the API refuses an invited email's sign-up that did not come from the invitation's link", async ({ request, baseURL }) => {
  const invitee = e2eEmail("io-nolink");
  created.push(invitee);
  await inviteByRow(DEMO_EMAIL, invitee);
  const res = await request.post("/api/auth/sign-up/email", {
    data: { name: "Mallory", email: invitee, password: E2E_PASSWORD },
    headers: { origin: baseURL!, ...asNewClient() },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).code).toBe("SIGNUP_INVITE_ONLY");
  const signIn = await request.post("/api/auth/sign-in/email", { data: { email: invitee, password: E2E_PASSWORD }, headers: { origin: baseURL!, ...asNewClient() } });
  expect(signIn.status()).toBe(401); // no account was made
});

test("an invitation's link still leads to a sign-up form, and the new account joins the workspace at once", async ({ page }) => {
  const invitee = e2eEmail("io-invitee");
  created.push(invitee);
  const invitationId = await inviteByRow(DEMO_EMAIL, invitee); // the demo user invites: nobody else can sign up here

  await page.goto(`/invite/${invitationId}`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-up" && !url.searchParams.has("email")); // U26: not in the link
  await expect(page.getByLabel("Email")).toHaveValue(invitee);
  await page.getByLabel("Your name").fill("Iris Invitee");
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // UX QA U26: no second press of Join; the account joins and opens the workspace
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toContainText("Demo workspace");
});

test("an invitation's sign-up form refuses another email in plain words", async ({ page }) => {
  const invitee = e2eEmail("io-invitee2");
  const other = e2eEmail("io-other");
  created.push(invitee, other);
  const invitationId = await inviteByRow(DEMO_EMAIL, invitee);

  await page.goto(`/invite/${invitationId}`);
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Oscar Other");
  await page.getByLabel("Email").fill(other);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(formError(page)).toHaveText("This does not match an invitation. Use the address your invitation was sent to, and open its link in this browser.");
});

test("signing in to an existing account is unchanged", async ({ page }) => {
  await page.goto("/sign-in");
  await signInThroughUi(page, DEMO_EMAIL, DEMO_PASSWORD);
  await expect(page).toHaveURL((url) => url.pathname === "/");
});

test("a Google sign-in refused for having no invitation comes back to sign-in with the plain line", async ({ page }) => {
  await page.goto("/sign-in?error=SIGNUP_INVITE_ONLY");
  await expect(page.getByText(INVITE_ONLY)).toBeVisible();
});
