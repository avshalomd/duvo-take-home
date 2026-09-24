// Better Auth's organization writes over HTTP (security review S4, QA F2-F4), against the real tables. `npm run test:int`.
// Requests go through auth.handler, as a browser's or a script's do; the app's own writes go through auth.api.
// Everything it creates uses an "int-orgw-" email and is deleted in afterAll.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { auth } from "./auth";
import { ORGANIZATION_WRITES_REFUSED } from "./organization-writes";
import { listMembers } from "./members";
import { sessionFromHeaders } from "./session";
import { ownedWorkspaceCount, workspaceLimitRefusal } from "./workspace-limit";

const BASE = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const PASSWORD = "int-password-123";
const created: string[] = [];

function email(what: string) {
  const address = `int-orgw-${what}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  created.push(address);
  return address;
}

function cookieHeaders(setCookie: string | null): Headers {
  const pairs = (setCookie ?? "").split(/,(?=\s*[\w.-]+=)/).map((c) => c.split(";")[0].trim());
  return new Headers({ cookie: pairs.join("; ") });
}

async function signUp(name: string, address: string) {
  const { headers, response } = await auth.api.signUpEmail({ body: { name, email: address, password: PASSWORD }, returnHeaders: true });
  return { userId: response.user.id, headers: cookieHeaders(headers.get("set-cookie")) };
}

/** A POST to Better Auth over HTTP, signed in with these cookies, from the app's own origin. */
function post(path: string, cookies: Headers, body: unknown): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, cookie: cookies.get("cookie") ?? "" },
      body: JSON.stringify(body),
    }),
  );
}

const nameOf = async (id: string) => (await db.select({ name: organization.name }).from(organization).where(eq(organization.id, id)))[0]?.name;

afterAll(async () => {
  if (created.length === 0) return;
  const ids = (await db.select({ id: user.id }).from(user).where(inArray(user.email, created))).map((u) => u.id);
  if (ids.length === 0) return;
  const orgs = await db.select({ id: member.organizationId }).from(member).where(inArray(member.userId, ids));
  if (orgs.length) await db.delete(organization).where(inArray(organization.id, orgs.map((o) => o.id)));
  await db.delete(user).where(inArray(user.id, ids));
});

describe.skipIf(!process.env.DATABASE_URL)("Better Auth's organization writes over HTTP", () => {
  it("refuses an owner's rename, invitation, role change, removal and deletion over HTTP, and nothing changes", async () => {
    const owner = await signUp("Hana Http", email("owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const [me] = await listMembers(ctx.workspaceId);

    const answers = await Promise.all([
      post("/organization/update", owner.headers, { data: { name: "[int] renamed over http" }, organizationId: ctx.workspaceId }),
      post("/organization/invite-member", owner.headers, { email: email("guest"), role: "member", organizationId: ctx.workspaceId }),
      post("/organization/update-member-role", owner.headers, { memberId: me.memberId, role: "member", organizationId: ctx.workspaceId }),
      post("/organization/remove-member", owner.headers, { memberIdOrEmail: me.memberId, organizationId: ctx.workspaceId }),
      post("/organization/delete", owner.headers, { organizationId: ctx.workspaceId }),
      post("/organization/leave", owner.headers, { organizationId: ctx.workspaceId }),
    ]);

    for (const answer of answers) {
      expect(answer.status).toBe(403);
      expect((await answer.json()).message).toBe(ORGANIZATION_WRITES_REFUSED);
    }
    expect(await nameOf(ctx.workspaceId)).toBe("Hana's workspace");
    expect((await listMembers(ctx.workspaceId)).map((m) => m.role)).toEqual(["owner"]);
  });

  it("refuses a workspace made over HTTP, whatever its name (F3: a 3,000-character one was accepted)", async () => {
    const owner = await signUp("Carl Create", email("create"));
    const before = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, owner.userId));

    const answer = await post("/organization/create", owner.headers, { name: `[int] ${"W".repeat(3000)}`, slug: `int-orgw-${crypto.randomUUID().slice(0, 8)}` });

    expect(answer.status).toBe(403);
    expect(await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, owner.userId))).toEqual(before);
  });

  it("keeps switching workspaces over HTTP working, which only moves the session", async () => {
    const owner = await signUp("Sal Switch", email("switch"));
    const ctx = (await sessionFromHeaders(owner.headers))!;

    expect((await post("/organization/set-active", owner.headers, { organizationId: ctx.workspaceId })).status).toBe(200);
  });

  // Security review S1, his call: one account made ten workspaces, each with a budget of its own
  it("lets a person own five workspaces, their own one included, and refuses a sixth in plain words", async () => {
    const owner = await signUp("Fifi Five", email("five"));
    for (let i = 2; i <= 5; i++) {
      await auth.api.createOrganization({ headers: owner.headers, body: { name: `[int] ${i}`, slug: `int-orgw-${crypto.randomUUID().slice(0, 8)}` } });
    }
    expect(await ownedWorkspaceCount(owner.userId)).toBe(5);

    await expect(
      auth.api.createOrganization({ headers: owner.headers, body: { name: "[int] 6", slug: `int-orgw-${crypto.randomUUID().slice(0, 8)}` } }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await ownedWorkspaceCount(owner.userId)).toBe(5);
    expect(await workspaceLimitRefusal(owner.userId)).toBe("You already own 5 workspaces, the most one person can have.");
  });

  it("lets the app's own writes through auth.api: a new workspace is made, and deleting one is not offered at all", async () => {
    const owner = await signUp("Ada Api", email("api"));
    const made = await auth.api.createOrganization({ headers: owner.headers, body: { name: "[int] made by the app", slug: `int-orgw-${crypto.randomUUID().slice(0, 8)}` } });
    expect(await nameOf(made!.id)).toBe("[int] made by the app");

    // F4: no screen deletes a workspace, and one deleted this way left its runs and schedules behind
    await expect(auth.api.deleteOrganization({ headers: owner.headers, body: { organizationId: made!.id } })).rejects.toMatchObject({ status: "NOT_FOUND" });
    expect(await nameOf(made!.id)).toBe("[int] made by the app");
  });
});
