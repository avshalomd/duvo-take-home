// Test support only: the connection rows in memory, standing in for ./rows, the store's setConnectionOAuth and the
// crypto (the settings package builds the real ones). Tests wire them in with vi.mock(..., () => import(...)).
import type { OAuthBlob } from "./shape";
import { AS_METADATA, AS_URL, MCP_URL, REDIRECT } from "./fake-server";

export type FakeRow = { id: string; workspaceId: string; name: string; url: string; authType: string; oauth: unknown };

export const rows = new Map<string, FakeRow>();
export const writes: { workspaceId: string; id: string; oauth: unknown }[] = [];

export const WS = "ws-a";
export const CONNECTION_ID = "6f1c2a4e-2f8e-4c1e-9a53-0b7d7c1d2e01";

export function resetRows(): void {
  rows.clear();
  writes.length = 0;
}

export function addRow(row: Partial<FakeRow> = {}): FakeRow {
  const full: FakeRow = { id: CONNECTION_ID, workspaceId: WS, name: "Linear", url: MCP_URL, authType: "none", oauth: null, ...row };
  rows.set(full.id, full);
  return full;
}

/** A sealed value is readable in a test but never equal to the plain secret, so a leak shows up in a toContain. */
export const seal = (plain: string) => `sealed:${Buffer.from(plain).toString("hex")}`;
export const unseal = (sealed: string) => {
  if (!sealed.startsWith("sealed:")) throw new Error("not sealed");
  return Buffer.from(sealed.slice("sealed:".length), "hex").toString();
};

/** A blob after a completed registration, with no sign-in pending and no tokens; override what a test needs. */
export function blob(over: Partial<OAuthBlob> = {}): OAuthBlob {
  return {
    authorizationServerUrl: AS_URL,
    metadata: AS_METADATA,
    resource: MCP_URL,
    scope: "read write",
    client: { clientId: "client-1", clientSecretEnc: null, authMethod: "none", redirectUri: REDIRECT, authorizationServerUrl: AS_URL },
    pending: null,
    tokens: null,
    needsSignIn: false,
    ...over,
  };
}

// --- the module doubles -------------------------------------------------------------------------------------

const copy = (r: FakeRow) => ({ id: r.id, workspaceId: r.workspaceId, name: r.name, url: r.url, oauth: structuredClone(r.oauth) });

export const rowsModule = {
  findConnection: async (workspaceId: string, id: string) => {
    const r = rows.get(id);
    return r && r.workspaceId === workspaceId ? copy(r) : null;
  },
  findByPendingState: async (state: string) => {
    const r = [...rows.values()].find((row) => (row.oauth as OAuthBlob | null)?.pending?.state === state);
    return r ? copy(r) : null;
  },
  loadOAuth: async (id: string) => {
    const r = rows.get(id);
    return r ? { workspaceId: r.workspaceId, oauth: structuredClone(r.oauth) } : null;
  },
  markOAuth: async (workspaceId: string, id: string) => {
    const r = rows.get(id);
    if (r && r.workspaceId === workspaceId) r.authType = "oauth";
  },
  // the real one is a conditional update (rows.ts): the same address, a sign-in state, and none pending
  storeTokensIfUnchanged: async (workspaceId: string, id: string, url: string, oauth: unknown) => {
    const r = rows.get(id);
    const current = r?.oauth as OAuthBlob | null | undefined;
    if (!r || r.workspaceId !== workspaceId || r.url !== url || !current || current.pending) return false;
    r.oauth = structuredClone(oauth);
    writes.push({ workspaceId, id, oauth: structuredClone(oauth) });
    return true;
  },
};

export const storeModule = {
  setConnectionOAuth: async (workspaceId: string, id: string, oauth: unknown) => {
    const r = rows.get(id);
    if (!r || r.workspaceId !== workspaceId) throw new Error("setConnectionOAuth: no such connection in that workspace");
    r.oauth = structuredClone(oauth);
    writes.push({ workspaceId, id, oauth: structuredClone(oauth) });
  },
};

export const cryptoModule = { encryptSecret: seal, decryptSecret: unseal };
