// Shared by the auth and tenancy specs: sign up through the UI, and delete the users a spec created.
// Local only: the specs write accounts, so they never run against a deployment others are looking at.
import { existsSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { expect, type APIRequest, type Browser, type Page } from "@playwright/test";

// Same path as DEMO_STATE in playwright.config.ts: the demo user's signed-in state from auth.setup.ts.
export const DEMO_STATE = "test-results/.auth/demo.json";
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
export const E2E_PASSWORD = "e2e-password-123";

// A browser with no cookies: these specs are about getting in, so they start signed out.
export const SIGNED_OUT = { cookies: [], origins: [] };

/**
 * Sign-in and sign-up allow 3 tries in 10 s per client address (lib/auth/auth.ts), and every test browser comes from
 * this one machine. A test that signs in or up poses as a client of its own: an address from 198.18.0.0/16 (reserved
 * for testing) in x-forwarded-for, which the local server takes as the client's (on Vercel the platform sets it). So
 * the suite stays under the limit, and only the test about the limit reaches it.
 */
export function asNewClient(): Record<string, string> {
  return { "x-forwarded-for": `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}` };
}

/** A fresh address per test; the "e2e-" prefix marks it as a test account if a clean-up is ever missed. */
export function e2eEmail(what: string) {
  return `e2e-${what}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

// The form's error: an alert, and the form's own. Next's route announcer is a role="alert" too, and after a
// client-side navigation it holds the new page's title, so "an alert with text" is not enough to find it.
export const formError = (page: Page) => page.getByRole("alert").and(page.getByTestId("auth-error"));

export async function signUpThroughUi(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("app-header")).toBeVisible();
}

export async function signInThroughUi(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

function sql() {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
  return neon(process.env.DATABASE_URL!);
}

/**
 * An invitation into the owner's personal workspace, written straight to the table: inviting from the UI is the
 * Members page's job (settings), and createInvite() has its own integration test. Deleted with the owner's workspace.
 */
export async function inviteByRow(ownerEmail: string, inviteeEmail: string): Promise<string> {
  const id = `e2e-invite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; // two specs in the same ms
  await sql()`
    insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id)
    select ${id}, m.organization_id, ${inviteeEmail}, 'member', 'pending', now() + interval '1 day', u.id
    from member m join "user" u on u.id = m.user_id
    where u.email = ${ownerEmail} and m.role = 'owner'`;
  return id;
}

/**
 * Puts an account into the owner's personal workspace with a role, straight in the table, and points the account's
 * sessions at it, as accepting an invitation would (that flow has its own tests). Deleted with the owner's workspace.
 */
export async function joinByRow(ownerEmail: string, email: string, role: "member" | "admin" | "owner") {
  const db = sql();
  const [workspace] = await db`
    select m.organization_id as id from member m join "user" u on u.id = m.user_id
    where u.email = ${ownerEmail} and m.role = 'owner'`;
  await db`
    insert into member (id, organization_id, user_id, role, created_at)
    select gen_random_uuid()::text, ${workspace.id}, u.id, ${role}, now() from "user" u where u.email = ${email}`;
  await db`update session set active_organization_id = ${workspace.id} where user_id = (select id from "user" where email = ${email})`;
}

/**
 * A new account made through Better Auth's own endpoint, and a browser signed in as it: quicker than the form when
 * the test is about something else. Close the browser's context when done.
 */
export async function signedInAs(requests: APIRequest, browser: Browser, baseURL: string, name: string, email: string) {
  const api = await requests.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL, ...asNewClient() } });
  try {
    await expect(await api.post("/api/auth/sign-up/email", { data: { name, email, password: E2E_PASSWORD } })).toBeOK();
    const context = await browser.newContext({ storageState: await api.storageState() });
    return { context, page: await context.newPage() };
  } finally {
    await api.dispose();
  }
}

/** Marks an invitation as used, as accepting it would: its link then says the invitation is closed. */
export async function closeInvitation(id: string) {
  await sql()`update invitation set status = 'accepted' where id = ${id}`;
}

/**
 * Deletes the given accounts and the workspaces they own (the demo workspace is owned by the demo user, so an
 * e2e user invited into it never takes it along). Members, sessions and accounts go by cascade.
 */
export async function deleteUsers(emails: string[]) {
  if (emails.length === 0) return;
  const db = sql();
  const owned = await db`
    select m.organization_id as id from member m join "user" u on u.id = m.user_id
    where u.email = any(${emails}) and m.role = 'owner'`;
  const ids = owned.map((r) => r.id as string);
  if (ids.length) {
    await db`delete from workspace_settings where workspace_id = any(${ids})`;
    await db`delete from organization where id = any(${ids})`;
  }
  await db`delete from "user" where email = any(${emails})`;
  await db`delete from invitation where email = any(${emails})`; // invitations into workspaces they did not own (the demo's)
}
