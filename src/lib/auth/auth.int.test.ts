// Sign-up, the personal workspace, sessions and invitations against the real tables. `npm run test:int`.
// Everything it creates uses an "int-" email and is deleted in afterAll (the database is shared with other agents).
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { invitation, member, organization, session, user } from "@/db/schema";
import { auth } from "./auth";
import { createInvite, getInvitation, listInvitations, listMembers, listWorkspaces, revokeInvite } from "./members";
import { sessionFromHeaders } from "./session";

const created: string[] = []; // emails, so afterAll deletes only what this file made
const PASSWORD = "int-password-123";

function email(what: string) {
  const address = `int-auth-${what}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  created.push(address);
  return address;
}

// The Cookie header a browser would send back after Better Auth answered with Set-Cookie.
function cookieHeaders(setCookie: string | null): Headers {
  const pairs = (setCookie ?? "").split(/,(?=\s*[\w.-]+=)/).map((c) => c.split(";")[0].trim());
  return new Headers({ cookie: pairs.join("; ") });
}

async function signUp(name: string, address: string) {
  const { headers, response } = await auth.api.signUpEmail({ body: { name, email: address, password: PASSWORD }, returnHeaders: true });
  return { userId: response.user.id, headers: cookieHeaders(headers.get("set-cookie")) };
}

async function workspacesOf(userId: string) {
  return db
    .select({ id: organization.id, name: organization.name, slug: organization.slug, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId));
}

afterAll(async () => {
  if (created.length === 0) return;
  const users = await db.select({ id: user.id }).from(user).where(inArray(user.email, created));
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return;
  const orgs = await db.select({ id: member.organizationId }).from(member).where(inArray(member.userId, ids));
  // organizations first (members and invitations cascade), then the users (sessions and accounts cascade)
  if (orgs.length) await db.delete(organization).where(inArray(organization.id, orgs.map((o) => o.id)));
  await db.delete(user).where(inArray(user.id, ids));
});

describe.skipIf(!process.env.DATABASE_URL)("sign-up and the personal workspace", () => {
  it("signing up creates a personal workspace named after the first name, with the new user as its owner", async () => {
    const { userId } = await signUp("Inty Tester", email("personal"));
    const workspaces = await workspacesOf(userId);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0].name).toBe("Inty's workspace");
    expect(workspaces[0].slug).toMatch(/^inty-tester-[a-z0-9]+$/);
    expect(workspaces[0].role).toBe("owner");
  });

  it("the session a sign-up returns is already active in that workspace", async () => {
    const { userId, headers } = await signUp("Inty Active", email("active"));
    const [workspace] = await workspacesOf(userId);
    const ctx = await sessionFromHeaders(headers);
    expect(ctx).toEqual({
      userId,
      userName: "Inty Active",
      email: expect.stringMatching(/^int-auth-active-/),
      workspaceId: workspace.id,
      workspaceName: "Inty's workspace",
      role: "owner",
    });
  });

  it("signing in again starts a session active in the user's first workspace", async () => {
    const address = email("signin");
    const { userId } = await signUp("Inty Returning", address);
    const [workspace] = await workspacesOf(userId);
    const { response } = await auth.api.signInEmail({ body: { email: address, password: PASSWORD }, returnHeaders: true });
    const [row] = await db.select().from(session).where(eq(session.token, response.token));
    expect(row.activeOrganizationId).toBe(workspace.id);
  });

  it("a session whose active workspace is gone falls back to the user's first workspace", async () => {
    const { userId, headers } = await signUp("Inty Moved", email("fallback"));
    const [workspace] = await workspacesOf(userId);
    await db.update(session).set({ activeOrganizationId: "int-no-such-workspace" }).where(eq(session.userId, userId));
    const ctx = await sessionFromHeaders(headers);
    expect(ctx?.workspaceId).toBe(workspace.id);
    const [row] = await db.select().from(session).where(eq(session.userId, userId));
    expect(row.activeOrganizationId).toBe(workspace.id); // and it is written back, so the next request agrees
  });

  it("no cookie means no session: sessionFromHeaders answers null, not an error", async () => {
    expect(await sessionFromHeaders(new Headers())).toBeNull();
    expect(await sessionFromHeaders(new Headers({ cookie: "better-auth.session_token=int-forged.value" }))).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)("members and invitations", () => {
  it("an owner's invitation is a link that the invited person accepts, which makes them a member", async () => {
    const owner = await signUp("Olive Owner", email("owner"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("guest");

    const { link } = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "member" });
    expect(link).toMatch(/\/invite\/[\w-]+$/);
    const invitationId = link.split("/invite/")[1];

    const guest = await signUp("Gus Guest", guestEmail);
    await auth.api.acceptInvitation({ body: { invitationId }, headers: guest.headers });

    const members = await listMembers(ownerCtx.workspaceId);
    expect(members.map((m) => [m.name, m.role])).toEqual([
      ["Olive Owner", "owner"],
      ["Gus Guest", "member"],
    ]);
    expect(members[1].email).toBe(guestEmail);

    const guestWorkspaces = await listWorkspaces(guest.userId);
    expect(guestWorkspaces.map((w) => w.name).sort()).toEqual(["Gus's workspace", "Olive's workspace"]);
    expect(guestWorkspaces.find((w) => w.id === ownerCtx.workspaceId)?.role).toBe("member");

    // accepting makes the invited workspace the active one, so the guest lands in it
    expect((await sessionFromHeaders(guest.headers))?.workspaceId).toBe(ownerCtx.workspaceId);
  });

  it("the invitation page can say who invited whom before anyone signs in, and the link closes once used", async () => {
    const owner = await signUp("Ivy Inviter", email("inviter"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("invitee");
    const { link } = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "member" });
    const invitationId = link.split("/invite/")[1];

    expect(await getInvitation(invitationId)).toEqual({
      id: invitationId,
      email: guestEmail,
      workspaceName: "Ivy's workspace",
      inviterName: "Ivy Inviter",
      open: true,
    });

    const guest = await signUp("Ian Invitee", guestEmail);
    await auth.api.acceptInvitation({ body: { invitationId }, headers: guest.headers });
    expect((await getInvitation(invitationId))?.open).toBe(false);
    expect(await getInvitation("int-no-such-invitation")).toBeNull();
  });

  it("inviting the same email twice gives the same link instead of an error", async () => {
    const owner = await signUp("Inty Twice", email("twice"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("twice-guest");
    const first = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "member" });
    const second = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "member" });
    expect(second.link).toBe(first.link);
  });

  it("a plain member cannot invite, and is told so in plain words", async () => {
    const owner = await signUp("Inty Boss", email("boss"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const memberEmail = email("plain");
    const { link } = await createInvite(owner.headers, ownerCtx, { email: memberEmail, role: "member" });
    const plain = await signUp("Inty Plain", memberEmail);
    await auth.api.acceptInvitation({ body: { invitationId: link.split("/invite/")[1] }, headers: plain.headers });
    const plainCtx = (await sessionFromHeaders(plain.headers))!;
    expect(plainCtx.role).toBe("member");

    await expect(createInvite(plain.headers, plainCtx, { email: email("nope"), role: "member" })).rejects.toThrow(/Only an owner or an admin can invite/);
  });

  it("listWorkspaces lists only the workspaces the user belongs to", async () => {
    const { userId } = await signUp("Inty Alone", email("alone"));
    const workspaces = await listWorkspaces(userId);
    expect(workspaces).toEqual([{ id: expect.any(String), name: "Inty's workspace", role: "owner" }]);
  });
});

// Q109: a pending invitation can be found again (its link copied) and revoked.
describe.skipIf(!process.env.DATABASE_URL)("pending invitations", () => {
  const idOf = (link: string) => link.split("/invite/")[1];

  it("lists the workspace's open invitations with their role, expiry and link, newest first", async () => {
    const owner = await signUp("Paula Pending", email("pending-owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const first = email("pending-a");
    const second = email("pending-b");
    const a = await createInvite(owner.headers, ctx, { email: first, role: "member" });
    const b = await createInvite(owner.headers, ctx, { email: second, role: "admin" });

    const list = await listInvitations(ctx.workspaceId);
    expect(list.map((i) => [i.email, i.role, i.link])).toEqual([
      [second, "admin", b.link],
      [first, "member", a.link],
    ]);
    expect(new Date(list[0].expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("an accepted invitation leaves the list, and another workspace's never shows in it", async () => {
    const owner = await signUp("Paul Pending", email("pending-owner2"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("pending-guest");
    const { link } = await createInvite(owner.headers, ctx, { email: guestEmail, role: "member" });
    const guest = await signUp("Gina Guest", guestEmail);
    await auth.api.acceptInvitation({ body: { invitationId: idOf(link) }, headers: guest.headers });
    expect(await listInvitations(ctx.workspaceId)).toEqual([]);

    const stranger = await signUp("Stan Stranger", email("pending-stranger"));
    const strangerCtx = (await sessionFromHeaders(stranger.headers))!;
    await createInvite(stranger.headers, strangerCtx, { email: email("pending-other"), role: "member" });
    expect(await listInvitations(ctx.workspaceId)).toEqual([]);
  });

  it("revoking closes the link and takes the invitation off the list", async () => {
    const owner = await signUp("Rita Revoker", email("revoke-owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const { link } = await createInvite(owner.headers, ctx, { email: email("revoke-guest"), role: "member" });

    await revokeInvite(owner.headers, ctx, idOf(link));
    expect(await listInvitations(ctx.workspaceId)).toEqual([]);
    expect((await getInvitation(idOf(link)))?.open).toBe(false);
  });

  it("a plain member cannot revoke, and is told so in plain words", async () => {
    const owner = await signUp("Rob Owner", email("revoke-owner2"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const memberEmail = email("revoke-member");
    const joined = await createInvite(owner.headers, ownerCtx, { email: memberEmail, role: "member" });
    const plain = await signUp("Pat Plain", memberEmail);
    await auth.api.acceptInvitation({ body: { invitationId: idOf(joined.link) }, headers: plain.headers });
    const plainCtx = (await sessionFromHeaders(plain.headers))!;
    const pending = await createInvite(owner.headers, ownerCtx, { email: email("revoke-pending"), role: "member" });

    await expect(revokeInvite(plain.headers, plainCtx, idOf(pending.link))).rejects.toThrow(/Only an owner or an admin can revoke/);
    expect((await listInvitations(ownerCtx.workspaceId)).map((i) => i.link)).toEqual([pending.link]);
  });

  it("an invitation of another workspace cannot be revoked from this one", async () => {
    const one = await signUp("Una One", email("revoke-one"));
    const oneCtx = (await sessionFromHeaders(one.headers))!;
    const { link } = await createInvite(one.headers, oneCtx, { email: email("revoke-one-guest"), role: "member" });
    const two = await signUp("Tom Two", email("revoke-two"));
    const twoCtx = (await sessionFromHeaders(two.headers))!;

    await expect(revokeInvite(two.headers, twoCtx, idOf(link))).rejects.toThrow(/no longer pending/);
    expect((await listInvitations(oneCtx.workspaceId)).map((i) => i.link)).toEqual([link]);
  });
});

// SIGNUP_MODE=invite (production): no account is made without a pending invitation, by the page, the API or Google.
describe.skipIf(!process.env.DATABASE_URL)("invite-only sign-up", () => {
  const idOf = (link: string) => link.split("/invite/")[1];
  const inviteOnly = { body: { code: "SIGNUP_INVITE_ONLY" } };
  const accountFor = async (address: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, address))).length;

  // Owners are made in open mode (the default), then the switch is turned for the call under test only.
  async function inInviteMode<T>(fn: () => Promise<T>): Promise<T> {
    process.env.SIGNUP_MODE = "invite";
    try {
      return await fn();
    } finally {
      delete process.env.SIGNUP_MODE;
    }
  }

  it("refuses a sign-up without an invitation, and makes no account", async () => {
    const address = email("uninvited");
    await expect(inInviteMode(() => signUp("Una Invited", address))).rejects.toMatchObject(inviteOnly);
    expect(await accountFor(address)).toBe(0);
  });

  it("lets an email with a pending invitation sign up, whatever the case it is typed in", async () => {
    const owner = await signUp("Ingrid Inviter", email("io-owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("io-guest");
    await createInvite(owner.headers, ctx, { email: guestEmail, role: "member" });

    const guest = await inInviteMode(() => signUp("Gil Guest", guestEmail.toUpperCase()));
    expect(guest.userId).toBeTruthy();
    expect(await accountFor(guestEmail)).toBe(1);
  });

  it("does not open sign-up for a revoked or an expired invitation", async () => {
    const owner = await signUp("Otto Owner", email("io-owner2"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const revokedEmail = email("io-revoked");
    const revoked = await createInvite(owner.headers, ctx, { email: revokedEmail, role: "member" });
    await revokeInvite(owner.headers, ctx, idOf(revoked.link));
    const expiredEmail = email("io-expired");
    const expired = await createInvite(owner.headers, ctx, { email: expiredEmail, role: "member" });
    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invitation.id, idOf(expired.link)));

    await expect(inInviteMode(() => signUp("Rae Revoked", revokedEmail))).rejects.toMatchObject(inviteOnly);
    await expect(inInviteMode(() => signUp("Ed Expired", expiredEmail))).rejects.toMatchObject(inviteOnly);
    expect(await accountFor(revokedEmail)).toBe(0);
    expect(await accountFor(expiredEmail)).toBe(0);
  });

  it("leaves signing in to an existing account unchanged", async () => {
    const address = email("io-existing");
    await signUp("Evan Existing", address);
    const { response } = await inInviteMode(() => auth.api.signInEmail({ body: { email: address, password: PASSWORD }, returnHeaders: true }));
    expect(response.token).toBeTruthy();
  });

  it("in open mode anyone can sign up", async () => {
    const address = email("io-open");
    await signUp("Olly Open", address);
    expect(await accountFor(address)).toBe(1);
  });
});
