// Q176: sign-in and sign-up tries are limited per client address and path, and counted in the database (the
// rate_limit table), so every function instance on Vercel reads the same count. `npm run test:int`.
// Requests go through auth.handler, as a browser's do: calls to auth.api.* skip the limiter. Each test poses as clients
// of its own from 198.19.0.0/16 (reserved for testing); their counts and the accounts made here are deleted afterwards.
import { afterAll, describe, expect, it } from "vitest";
import { inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, rateLimit, user } from "@/db/schema";
import { auth } from "./auth";
import { friendlyAuthError } from "./errors";

const BASE = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const PASSWORD = "int-password-123";
const emails: string[] = [];
const clients: string[] = [];

function newClient(): string {
  const ip = `198.19.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
  clients.push(ip);
  return ip;
}

async function account(): Promise<string> {
  const address = `int-limit-${crypto.randomUUID().slice(0, 8)}@example.com`;
  emails.push(address);
  await auth.api.signUpEmail({ body: { name: "Lim Iter", email: address, password: PASSWORD } }); // not through the limiter
  return address;
}

/** A POST to one of Better Auth's endpoints from the client at `ip`, the way the sign-in form sends it. */
function post(path: "/sign-in/email" | "/sign-up/email", ip: string, body: Record<string, string>): Promise<Response> {
  return auth.handler(
    new Request(`${BASE}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}

const signIn = (ip: string, email: string, password: string) => post("/sign-in/email", ip, { email, password });

afterAll(async () => {
  if (clients.length) await db.delete(rateLimit).where(or(...clients.map((ip) => like(rateLimit.key, `${ip}|%`))));
  const ids = (await db.select({ id: user.id }).from(user).where(inArray(user.email, emails.length ? emails : [""]))).map((u) => u.id);
  if (ids.length === 0) return;
  // their personal workspaces first (members cascade), then the users (sessions and accounts cascade)
  const owned = await db.select({ id: member.organizationId }).from(member).where(inArray(member.userId, ids));
  if (owned.length) await db.delete(organization).where(inArray(organization.id, owned.map((o) => o.id)));
  await db.delete(user).where(inArray(user.id, ids));
});

describe.skipIf(!process.env.DATABASE_URL)("sign-in and sign-up tries per client", () => {
  it("is on outside production too, and counts in the database", async () => {
    const context = await auth.$context;
    expect(process.env.NODE_ENV).not.toBe("production"); // Better Auth's default would have it off here
    expect(context.rateLimit.enabled).toBe(true);
    expect(context.rateLimit.storage).toBe("database");
  });

  it("refuses the fourth wrong sign-in in ten seconds with 429, which the form says in plain words", async () => {
    const email = await account();
    const ip = newClient();
    for (let i = 0; i < 3; i++) expect((await signIn(ip, email, "wrong-password")).status).toBe(401);

    const fourth = await signIn(ip, email, "wrong-password");
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get("x-retry-after"))).toBeGreaterThan(0);
    expect(Number(fourth.headers.get("x-retry-after"))).toBeLessThanOrEqual(10);
    expect(friendlyAuthError({ status: fourth.status })).toBe("Too many tries. Wait a minute, then try again.");
  });

  it("does not hold back another client: its wrong password is still only wrong", async () => {
    const email = await account();
    const busy = newClient();
    for (let i = 0; i < 4; i++) await signIn(busy, email, "wrong-password");
    expect((await signIn(busy, email, "wrong-password")).status).toBe(429);

    expect((await signIn(newClient(), email, "wrong-password")).status).toBe(401);
    expect((await signIn(newClient(), email, PASSWORD)).status).toBe(200);
  });

  // Counting the client, not the account: nobody can lock someone else out by typing their address wrong on purpose
  it("counts the client's tries, so the right password and another address wait too", async () => {
    const [email, other] = [await account(), await account()];
    const ip = newClient();
    for (let i = 0; i < 3; i++) await signIn(ip, email, "wrong-password");
    expect((await signIn(ip, email, PASSWORD)).status).toBe(429);
    expect((await signIn(ip, other, PASSWORD)).status).toBe(429);
  });

  it("keeps the count in the rate_limit table, one row per client and path", async () => {
    const email = await account();
    const ip = newClient();
    for (let i = 0; i < 2; i++) await signIn(ip, email, "wrong-password");
    const rows = await db.select().from(rateLimit).where(like(rateLimit.key, `${ip}|%`));
    expect(rows.map((r) => [r.key, r.count])).toEqual([[`${ip}|/sign-in/email`, 2]]);
  });

  it("limits sign-up the same way, on its own count", async () => {
    const taken = await account(); // an address that has an account: the tries fail without making anything
    const ip = newClient();
    for (let i = 0; i < 3; i++) expect((await post("/sign-up/email", ip, { name: "Lim", email: taken, password: PASSWORD })).status).not.toBe(429);
    expect((await post("/sign-up/email", ip, { name: "Lim", email: taken, password: PASSWORD })).status).toBe(429);
    expect((await signIn(ip, taken, PASSWORD)).status).toBe(200); // signing in from the same client counts apart
  });
});
