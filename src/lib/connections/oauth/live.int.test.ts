// A live check against real public MCP servers that sign in with OAuth: discovery and dynamic client registration,
// up to the authorization URL. No sign-in is completed (that needs a person's account). Network-bound, so it runs
// only with LIVE_OAUTH=1: `LIVE_OAUTH=1 npm run test:int -- src/lib/connections/oauth/live`. Rows are "[int] ..." and deleted.
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { connections } from "@/db/schema";
import { findByPendingState } from "./rows";
import { startOAuth } from "./start";

// The settings package owns the real store write and the encryption; until it lands they are stood in for here:
// the write goes to the same column, the "encryption" is a reversible marker (the test data is thrown away).
vi.mock("@/lib/connections/store", async () => {
  const { db } = await import("@/db");
  const { connections } = await import("@/db/schema");
  const { and, eq } = await import("drizzle-orm");
  return {
    setConnectionOAuth: async (workspaceId: string, id: string, oauth: unknown) => {
      await db.update(connections).set({ oauth }).where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId)));
    },
  };
});
vi.mock("@/lib/connections/crypto", async () => (await import("./fake-store")).cryptoModule);

const WS = "int-oauth-live-workspace";
const REDIRECT = "http://localhost:3008/api/connections/oauth/callback";

async function connection(name: string, url: string) {
  const [row] = await db.insert(connections).values({ workspaceId: WS, name: `[int] ${name}`, url }).returning();
  return row;
}

afterAll(async () => {
  await db.delete(connections).where(like(connections.name, "[int]%"));
});

describe.skipIf(!process.env.DATABASE_URL || process.env.LIVE_OAUTH !== "1")("live OAuth discovery and registration", () => {
  it.each([
    ["Linear", "https://mcp.linear.app/mcp"],
    ["Notion", "https://mcp.notion.com/mcp"],
    ["Sentry", "https://mcp.sentry.dev/mcp"],
  ])("%s: registers our app and produces a valid authorization URL", async (name, url) => {
    const row = await connection(name, url);

    const { authorizeUrl } = await startOAuth(WS, row.id, REDIRECT);

    const authorize = new URL(authorizeUrl);
    console.log(`${name}: ${authorize.origin}${authorize.pathname} client_id=${authorize.searchParams.get("client_id")?.slice(0, 8)}... scope=${authorize.searchParams.get("scope")} resource=${authorize.searchParams.get("resource")}`);
    expect(authorize.protocol).toBe("https:");
    expect(authorize.searchParams.get("response_type")).toBe("code");
    expect(authorize.searchParams.get("client_id")).toBeTruthy();
    expect(authorize.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(authorize.searchParams.get("resource")).toBe(url);

    // The state in the URL is the one stored, and the callback's lookup finds this connection by it.
    const state = authorize.searchParams.get("state")!;
    expect((await findByPendingState(state))?.id).toBe(row.id);

    // The authorization page answers (a page or a redirect to the server's login), not an error about our request.
    const page = await fetch(authorizeUrl, { redirect: "manual" });
    expect(page.status, `authorize answered ${page.status}`).toBeLessThan(400);
    await page.body?.cancel();

    const [stored] = await db.select().from(connections).where(eq(connections.id, row.id));
    expect(JSON.stringify(stored.oauth)).toContain(authorize.searchParams.get("client_id")!);
  }, 30_000);

  it("DeepWiki, which needs no sign-in, gets the plain sentence and nothing is stored", async () => {
    const row = await connection("DeepWiki", "https://mcp.deepwiki.com/mcp");

    await expect(startOAuth(WS, row.id, REDIRECT)).rejects.toThrow("This server works without signing in, so it needs neither a sign-in nor a token");

    const [stored] = await db.select().from(connections).where(eq(connections.id, row.id));
    expect(stored.oauth).toBeNull();
  }, 30_000);
});
