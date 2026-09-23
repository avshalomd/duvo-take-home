// Sign-up, the personal workspace, sessions and invitations against the real tables. `npm run test:int`.
// Everything it creates uses an "int-" email and is deleted in afterAll (the database is shared with other agents).
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { invitation, member, organization, session, user } from "@/db/schema";
import { auth } from "./auth";
import { INVITATION_COOKIE } from "./invitation-cookie";
import { changeMemberRole, createInvite, getInvitation, listInvitations, listMembers, listWorkspaces, removeFromWorkspace, revokeInvite } from "./members";
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

/** `fromLink`: the id of the invitation whose page this browser opened, sent back as the cookie that page leaves. */
async function signUp(name: string, address: string, fromLink?: string) {
  const request = fromLink ? new Headers({ cookie: `${INVITATION_COOKIE}=${fromLink}` }) : undefined;
  const { headers, response } = await auth.api.signUpEmail({ body: { name, email: address, password: PASSWORD }, headers: request, returnHeaders: true });
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

  // Security QA: resend only renewed the pending invitation, so "invite again as admin" kept it a member invitation.
  it("inviting a pending address again with another role closes the old link and gives a new one with the new role", async () => {
    const owner = await signUp("Rhea Reinviter", email("reinvite"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("reinvite-guest");
    const asMember = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "member" });
    const asAdmin = await createInvite(owner.headers, ownerCtx, { email: guestEmail, role: "admin" });

    expect(asAdmin.link).not.toBe(asMember.link);
    expect((await getInvitation(asMember.link.split("/invite/")[1]))?.open).toBe(false);
    expect((await listInvitations(ownerCtx)).map((i) => [i.email, i.role, i.link])).toEqual([[guestEmail, "admin", asAdmin.link]]);
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

// Security QA: an invitation's id plus its email was enough to take the invitation (sign up as that email, accept
// it). The id is the proof of holding the link, so nothing hands it to anyone but the owners and admins who send it.
describe.skipIf(!process.env.DATABASE_URL)("invitation ids reach owners and admins only", () => {
  /** An owner, a plain member of the owner's workspace, and an invitation still pending in it. */
  async function workspaceWithAMemberAndAnInvitation() {
    const owner = await signUp("Oona Owner", email("ids-owner"));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    const memberEmail = email("ids-member");
    const joined = await createInvite(owner.headers, ownerCtx, { email: memberEmail, role: "member" });
    const plain = await signUp("Pia Plain", memberEmail);
    await auth.api.acceptInvitation({ body: { invitationId: joined.link.split("/invite/")[1] }, headers: plain.headers });
    const plainCtx = (await sessionFromHeaders(plain.headers))!;
    const pendingEmail = email("ids-pending");
    const pending = await createInvite(owner.headers, ownerCtx, { email: pendingEmail, role: "admin" });
    return { owner, ownerCtx, plain, plainCtx, pendingEmail, pendingId: pending.link.split("/invite/")[1] };
  }

  it("Better Auth's list of a workspace's invitations refuses a plain member, and still answers an owner", async () => {
    const { owner, ownerCtx, plain, pendingId } = await workspaceWithAMemberAndAnInvitation();
    const query = { organizationId: ownerCtx.workspaceId };

    await expect(auth.api.listInvitations({ headers: plain.headers, query })).rejects.toMatchObject({ status: "FORBIDDEN" });
    await expect(auth.api.listInvitations({ headers: plain.headers })).rejects.toMatchObject({ status: "FORBIDDEN" }); // the active workspace, by default
    const forOwner = await auth.api.listInvitations({ headers: owner.headers, query });
    expect(forOwner.map((i) => i.id)).toContain(pendingId);
  });

  it("the full workspace Better Auth hands a plain member has no invitations in it; the owner's has them", async () => {
    const { owner, ownerCtx, plain, pendingId } = await workspaceWithAMemberAndAnInvitation();
    const query = { organizationId: ownerCtx.workspaceId };

    const forMember = await auth.api.getFullOrganization({ headers: plain.headers, query });
    expect(forMember?.id).toBe(ownerCtx.workspaceId);
    expect(forMember?.members.length).toBe(2); // the rest of the answer is untouched
    expect(forMember?.invitations).toEqual([]);
    const forOwner = await auth.api.getFullOrganization({ headers: owner.headers, query });
    expect(forOwner?.invitations.map((i) => i.id)).toContain(pendingId);
  });

  it("nobody reads the invitations sent to their own email through the API: the link is the only way to an id", async () => {
    const { ownerCtx, pendingEmail } = await workspaceWithAMemberAndAnInvitation();
    // An account for the invited address made before the invitation (possible when sign-up is open to anyone)
    const early = await signUp("Early Bird", pendingEmail);
    await expect(auth.api.listUserInvitations({ headers: early.headers })).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect((await listInvitations(ownerCtx)).map((i) => i.email)).toContain(pendingEmail); // still pending, still the owner's to send
  });

  it("our own list of pending invitations refuses a plain member in plain words", async () => {
    const { plainCtx } = await workspaceWithAMemberAndAnInvitation();
    await expect(listInvitations(plainCtx)).rejects.toThrow("Only an owner or an admin can see the pending invitations.");
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

    const list = await listInvitations(ctx);
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
    expect(await listInvitations(ctx)).toEqual([]);

    const stranger = await signUp("Stan Stranger", email("pending-stranger"));
    const strangerCtx = (await sessionFromHeaders(stranger.headers))!;
    await createInvite(stranger.headers, strangerCtx, { email: email("pending-other"), role: "member" });
    expect(await listInvitations(ctx)).toEqual([]);
  });

  it("revoking closes the link and takes the invitation off the list", async () => {
    const owner = await signUp("Rita Revoker", email("revoke-owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const { link } = await createInvite(owner.headers, ctx, { email: email("revoke-guest"), role: "member" });

    await revokeInvite(owner.headers, ctx, idOf(link));
    expect(await listInvitations(ctx)).toEqual([]);
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
    expect((await listInvitations(ownerCtx)).map((i) => i.link)).toEqual([pending.link]);
  });

  it("an invitation of another workspace cannot be revoked from this one", async () => {
    const one = await signUp("Una One", email("revoke-one"));
    const oneCtx = (await sessionFromHeaders(one.headers))!;
    const { link } = await createInvite(one.headers, oneCtx, { email: email("revoke-one-guest"), role: "member" });
    const two = await signUp("Tom Two", email("revoke-two"));
    const twoCtx = (await sessionFromHeaders(two.headers))!;

    await expect(revokeInvite(two.headers, twoCtx, idOf(link))).rejects.toThrow(/no longer pending/);
    expect((await listInvitations(oneCtx)).map((i) => i.link)).toEqual([link]);
  });
});

// Q169: owners and admins remove people and change roles from the Members page. Better Auth does the change with the
// asker's headers (its own permission rules apply); the app's rules (lib/auth/member-rules.ts) are asked first.
describe.skipIf(!process.env.DATABASE_URL)("removing people and changing roles", () => {
  /** An owner's workspace with an admin and a plain member in it, each joined by accepting an invitation. */
  async function team(tag: string) {
    const owner = await signUp("Olga Owner", email(`${tag}-owner`));
    const ownerCtx = (await sessionFromHeaders(owner.headers))!;
    async function join(name: string, role: "member" | "admin") {
      const address = email(`${tag}-${role}`);
      const { link } = await createInvite(owner.headers, ownerCtx, { email: address, role });
      const person = await signUp(name, address);
      await auth.api.acceptInvitation({ body: { invitationId: link.split("/invite/")[1] }, headers: person.headers });
      return { ...person, ctx: (await sessionFromHeaders(person.headers))! }; // accepting makes the workspace the active one
    }
    const admin = await join("Adam Admin", "admin");
    const plain = await join("Mia Member", "member");
    const members = await listMembers(ownerCtx.workspaceId);
    const memberIdOf = (userId: string) => members.find((m) => m.userId === userId)!.memberId;
    const roles = async () => (await listMembers(ownerCtx.workspaceId)).map((m) => [m.name, m.role]);
    return { owner, ownerCtx, admin, plain, memberIdOf, roles };
  }

  it("lists each person with the id of their membership, which the changes are made by", async () => {
    const { ownerCtx } = await team("rm-ids");
    const members = await listMembers(ownerCtx.workspaceId);
    expect(members.every((m) => typeof m.memberId === "string" && m.memberId.length > 0)).toBe(true);
    expect(new Set(members.map((m) => m.memberId)).size).toBe(3);
  });

  it("an owner makes a member an admin, then an owner, and the list says so", async () => {
    const { owner, ownerCtx, plain, memberIdOf, roles } = await team("rm-promote");
    await changeMemberRole(owner.headers, ownerCtx, memberIdOf(plain.userId), "admin");
    expect(await roles()).toContainEqual(["Mia Member", "admin"]);
    await changeMemberRole(owner.headers, ownerCtx, memberIdOf(plain.userId), "owner");
    expect(await roles()).toContainEqual(["Mia Member", "owner"]);
  });

  it("an owner removes a member: they leave the list, and their next request opens their own workspace instead", async () => {
    const { owner, ownerCtx, plain, memberIdOf, roles } = await team("rm-remove");
    expect(plain.ctx.workspaceId).toBe(ownerCtx.workspaceId); // they were looking at the owner's workspace

    await removeFromWorkspace(owner.headers, ownerCtx, memberIdOf(plain.userId));
    expect((await roles()).map(([name]) => name)).not.toContain("Mia Member");

    const next = await sessionFromHeaders(plain.headers); // no error, no 500: the session falls back to what is theirs
    expect(next?.workspaceName).toBe("Mia's workspace");
    expect((await listWorkspaces(plain.userId)).map((w) => w.id)).not.toContain(ownerCtx.workspaceId);
  });

  it("an admin makes a member an admin and removes another admin", async () => {
    const { owner, ownerCtx, admin, plain, memberIdOf, roles } = await team("rm-admin-ok");
    await changeMemberRole(admin.headers, admin.ctx, memberIdOf(plain.userId), "admin");
    expect(await roles()).toContainEqual(["Mia Member", "admin"]);
    await removeFromWorkspace(admin.headers, admin.ctx, memberIdOf(plain.userId));
    expect((await listMembers(ownerCtx.workspaceId)).map((m) => m.userId)).toEqual([owner.userId, admin.userId]);
  });

  it("an admin can neither remove nor demote the owner, nor make anyone an owner, and nothing changes", async () => {
    const { owner, admin, plain, memberIdOf, roles } = await team("rm-admin-no");
    const before = await roles();
    await expect(removeFromWorkspace(admin.headers, admin.ctx, memberIdOf(owner.userId))).rejects.toThrow("Only an owner can remove an owner.");
    await expect(changeMemberRole(admin.headers, admin.ctx, memberIdOf(owner.userId), "member")).rejects.toThrow("Only an owner can change an owner's role.");
    await expect(changeMemberRole(admin.headers, admin.ctx, memberIdOf(plain.userId), "owner")).rejects.toThrow("Only an owner can make someone an owner.");
    expect(await roles()).toEqual(before);
  });

  it("a plain member can neither remove nor change anyone", async () => {
    const { admin, plain, memberIdOf, roles } = await team("rm-plain");
    const before = await roles();
    await expect(removeFromWorkspace(plain.headers, plain.ctx, memberIdOf(admin.userId))).rejects.toThrow("Only an owner or an admin can remove people from this workspace.");
    await expect(changeMemberRole(plain.headers, plain.ctx, memberIdOf(admin.userId), "member")).rejects.toThrow("Only an owner or an admin can change someone's role.");
    expect(await roles()).toEqual(before);
  });

  it("nobody removes or changes themselves here, so the only owner always stays", async () => {
    const { owner, ownerCtx, memberIdOf, roles } = await team("rm-self");
    const before = await roles();
    await expect(removeFromWorkspace(owner.headers, ownerCtx, memberIdOf(owner.userId))).rejects.toThrow("You cannot remove yourself here.");
    await expect(changeMemberRole(owner.headers, ownerCtx, memberIdOf(owner.userId), "admin")).rejects.toThrow("You cannot change your own role here.");
    expect(await roles()).toEqual(before);
  });

  it("a membership of another workspace is not found from this one, and stays where it is", async () => {
    const one = await team("rm-other-a");
    const two = await team("rm-other-b");
    const theirs = two.memberIdOf(two.plain.userId);
    const NOT_FOUND = "That person could not be found in this workspace. Reload the page to see who is in it.";
    await expect(removeFromWorkspace(one.owner.headers, one.ownerCtx, theirs)).rejects.toThrow(NOT_FOUND);
    await expect(changeMemberRole(one.owner.headers, one.ownerCtx, theirs, "admin")).rejects.toThrow(NOT_FOUND);
    expect(await two.roles()).toContainEqual(["Mia Member", "member"]);
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

  it("lets the invited person sign up from the invitation's link, whatever the case the email is typed in", async () => {
    const owner = await signUp("Ingrid Inviter", email("io-owner"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("io-guest");
    const { link } = await createInvite(owner.headers, ctx, { email: guestEmail, role: "member" });

    const guest = await inInviteMode(() => signUp("Gil Guest", guestEmail.toUpperCase(), idOf(link)));
    expect(guest.userId).toBeTruthy();
    expect(await accountFor(guestEmail)).toBe(1);
  });

  // Security QA: knowing an invited address was enough to make its account first, and then to take the invitation.
  it("refuses an invited email when the sign-up does not come from the invitation's link, and makes no account", async () => {
    const owner = await signUp("Ines Inviter", email("io-owner3"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const guestEmail = email("io-nolink");
    await createInvite(owner.headers, ctx, { email: guestEmail, role: "admin" });

    await expect(inInviteMode(() => signUp("Mallory", guestEmail))).rejects.toMatchObject(inviteOnly);
    expect(await accountFor(guestEmail)).toBe(0);
  });

  it("refuses the link of an invitation sent to another email, and a link to no invitation at all", async () => {
    const owner = await signUp("Ivo Inviter", email("io-owner4"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const mine = await createInvite(owner.headers, ctx, { email: email("io-mine"), role: "member" });
    const otherEmail = email("io-theirs");
    await createInvite(owner.headers, ctx, { email: otherEmail, role: "member" });

    await expect(inInviteMode(() => signUp("Mallory", otherEmail, idOf(mine.link)))).rejects.toMatchObject(inviteOnly);
    await expect(inInviteMode(() => signUp("Mallory", otherEmail, "int-no-such-invitation"))).rejects.toMatchObject(inviteOnly);
    expect(await accountFor(otherEmail)).toBe(0);
  });

  it("does not open sign-up for a revoked or an expired invitation, even from its link", async () => {
    const owner = await signUp("Otto Owner", email("io-owner2"));
    const ctx = (await sessionFromHeaders(owner.headers))!;
    const revokedEmail = email("io-revoked");
    const revoked = await createInvite(owner.headers, ctx, { email: revokedEmail, role: "member" });
    await revokeInvite(owner.headers, ctx, idOf(revoked.link));
    const expiredEmail = email("io-expired");
    const expired = await createInvite(owner.headers, ctx, { email: expiredEmail, role: "member" });
    await db.update(invitation).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(invitation.id, idOf(expired.link)));

    await expect(inInviteMode(() => signUp("Rae Revoked", revokedEmail, idOf(revoked.link)))).rejects.toMatchObject(inviteOnly);
    await expect(inInviteMode(() => signUp("Ed Expired", expiredEmail, idOf(expired.link)))).rejects.toMatchObject(inviteOnly);
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
