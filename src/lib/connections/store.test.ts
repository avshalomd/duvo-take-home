// The header path a run takes, without a database or a paid run: the stored (encrypted) token comes out of
// listEnabledConnectionsWithSecrets decrypted, and authHeaders turns it into the Authorization header the MCP client sends.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { connections } from "@/db/schema";
import { authHeaders } from "./oauth";
import { encryptSecret } from "./crypto";
import { blob } from "./oauth/fake-store";
import { listEnabledConnectionsWithSecrets } from "./store";

type Row = typeof connections.$inferSelect;
const state = vi.hoisted(() => ({ rows: [] as unknown[] }));

// Only the query chain the function uses: select().from().where().orderBy() -> the rows set by the test.
vi.mock("@/db", () => {
  const chain = { from: () => chain, where: () => chain, orderBy: async () => state.rows };
  return { db: { select: () => chain } };
});

const saved = process.env.CONNECTION_KEY;
beforeAll(() => {
  process.env.CONNECTION_KEY = randomBytes(32).toString("base64");
});
afterAll(() => {
  process.env.CONNECTION_KEY = saved;
});

const row = (over: Partial<Row>): Row => ({
  id: "dc49fcd5-b93b-4bb4-afba-f0d9a2549af9",
  workspaceId: "ws-a",
  authType: "bearer",
  tokenEnc: null,
  oauth: null,
  tools: [],
  updatedAt: null,
  name: "GitHub",
  url: "https://api.githubcopilot.com/mcp/",
  transport: "http",
  token: null,
  enabled: true,
  lastStatus: null,
  createdAt: new Date("2026-09-23T08:00:00.000Z"),
  ...over,
});

describe("listEnabledConnectionsWithSecrets, the agent's view", () => {
  it("decrypts token_enc, so the run sends Authorization: Bearer <the token the user pasted>", async () => {
    state.rows = [row({ tokenEnc: encryptSecret("ghp_secret") })];
    const [c] = await listEnabledConnectionsWithSecrets("ws-a");
    expect(c.token).toBe("ghp_secret");
    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer ghp_secret" });
  });

  it("still sends the legacy plain token of a row the migration has not reached", async () => {
    state.rows = [row({ token: "legacy_secret" })];
    const [c] = await listEnabledConnectionsWithSecrets("ws-a");
    expect(await authHeaders(c)).toEqual({ Authorization: "Bearer legacy_secret" });
  });

  it("sends no header for a server that needs no sign-in", async () => {
    state.rows = [row({ authType: "none", name: "DeepWiki", url: "https://mcp.deepwiki.com/mcp" })];
    const [c] = await listEnabledConnectionsWithSecrets("ws-a");
    expect(c.token).toBeNull();
    expect(await authHeaders(c)).toBeUndefined();
  });

  it("hands the OAuth state through untouched for the oauth module to read", async () => {
    const oauth = blob({ tokens: { accessTokenEnc: "v1:sealed", refreshTokenEnc: null, expiresAt: null } });
    state.rows = [row({ authType: "oauth", oauth })];
    const [c] = await listEnabledConnectionsWithSecrets("ws-a");
    expect(c.oauth).toEqual(oauth);
    expect(c.signedIn).toBe(true);
  });
});
