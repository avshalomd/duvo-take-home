// Names through Better Auth's own doors (QA F1, F21), against the real tables. `npm run test:int`. Sign-ups go through
// auth.handler as the form's do, from clients of their own in 198.19.0.0/16 (the sign-up limit counts per address).
// Everything it creates uses an "int-names-" email and is deleted in afterAll, with the rate-limit counts.
import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, rateLimit, user } from "@/db/schema";
import { auth } from "./auth";

const BASE = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const PASSWORD = "int-password-123";
const created: string[] = [];
const clients: string[] = [];

function email(what: string) {
  const address = `int-names-${what}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  created.push(address);
  return address;
}

function newClient(): string {
  const ip = `198.19.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
  clients.push(ip);
  return ip;
}

function post(path: string, body: unknown, cookie = ""): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": newClient(), cookie },
      body: JSON.stringify(body),
    }),
  );
}

const userCount = async (address: string) => (await db.select({ id: user.id }).from(user).where(eq(user.email, address))).length;
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(/,(?=\s*[\w.-]+=)/).map((c) => c.split(";")[0].trim()).join("; ");

afterAll(async () => {
  if (clients.length) await db.delete(rateLimit).where(or(...clients.map((ip) => like(rateLimit.key, `${ip}|%`))));
  const ids = (await db.select({ id: user.id }).from(user).where(inArray(user.email, created.length ? created : [""]))).map((u) => u.id);
  if (ids.length === 0) return;
  const orgs = await db.select({ id: member.organizationId }).from(member).where(inArray(member.userId, ids));
  if (orgs.length) await db.delete(organization).where(inArray(organization.id, orgs.map((o) => o.id)));
  await db.delete(user).where(inArray(user.id, ids));
});

describe.skipIf(!process.env.DATABASE_URL)("names through Better Auth", () => {
  it("a sign-up with a NUL character in the name is refused with 400 in plain words, and no account is made", async () => {
    const address = email("nul");
    const res = await post("/sign-up/email", { name: "Ann\u0000 Other", email: address, password: PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NAME_HIDDEN_CHARACTER");
    expect(await userCount(address)).toBe(0);
  });

  it("a sign-up with a 5,005-character name is refused, and no account or workspace is made", async () => {
    const address = email("long");
    const res = await post("/sign-up/email", { name: `[int]${"N".repeat(5000)}`, email: address, password: PASSWORD });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NAME_TOO_LONG");
    expect(await userCount(address)).toBe(0);
  });

  it("a signed-in person cannot give themselves a longer name through Better Auth's update either", async () => {
    const address = email("update");
    const signedUp = await post("/sign-up/email", { name: "Una Update", email: address, password: PASSWORD });
    expect(signedUp.status).toBe(200);

    const res = await post("/update-user", { name: "N".repeat(81) }, cookieOf(signedUp));

    expect(res.status).toBe(400);
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.email, address));
    expect(row.name).toBe("Una Update");
  });

  it("the app's own new workspace keeps to 60 characters, whoever calls Better Auth", async () => {
    const address = email("ws");
    const signedUp = await post("/sign-up/email", { name: "Wes Workspace", email: address, password: PASSWORD });
    const headers = new Headers({ cookie: cookieOf(signedUp) });

    await expect(
      auth.api.createOrganization({ headers, body: { name: `[int] ${"W".repeat(60)}`, slug: `int-names-${crypto.randomUUID().slice(0, 8)}` } }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });
});
