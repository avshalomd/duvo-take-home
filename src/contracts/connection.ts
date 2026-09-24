import { z } from "zod";
import { isPrivateHost } from "@/lib/net/address";
import { noNul } from "./text";

// A connection is one of the user's MCP servers over http. The token never leaves the server: the UI gets hasToken.
export const Transport = z.enum(["http", "sse"]);
export const Connection = z.object({
  id: z.string(),
  name: z.string(),
  url: z.url(),
  transport: Transport,
  hasToken: z.boolean(),
  enabled: z.boolean(),
  lastStatus: z.string().nullable(), // from the last run's init message: "connected" or the failure text
  // v2, optional so v1 fixtures still parse
  authType: z.enum(["none", "bearer", "oauth"]).optional(),
  signedIn: z.boolean().optional(), // oauth only: a token is stored and not expired beyond refresh
  tools: z.array(z.string()).optional(), // tool names seen in the last run's init message
});
export type Connection = z.infer<typeof Connection>;

// Only a public http(s) host: the SDK child fetches this URL server-side, so loopback, link-local and private
// ranges would turn a connection into a request into our own network (QA round 3, Q46). The rule is by what an
// address is, not how it is spelled (lib/net/address.ts, security QA); this schema check covers what was typed, and
// a name that resolves inside is refused where it is looked up: on save, on every sign-in fetch and at run start.
export { isPrivateHost }; // the rule, re-exported beside the schema that uses it
export const PRIVATE_ADDRESS = "That address points at a private or local network, which a connection cannot reach";
export const publicHttpUrl = z
  .url("Give the server's full address, starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Only http:// or https:// addresses can be connected")
  .refine((u) => { try { return !isPrivateHost(new URL(u).hostname); } catch { return false; } }, PRIVATE_ADDRESS);

const RESERVED_KEYS = ["plan", "outputs"];

export const NewConnection = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the server a name")
    .max(40, "Keep the name under 40 characters")
    .regex(/^[A-Za-z0-9 _-]+$/, "Use letters, digits, spaces, - and _ only") // becomes the mcp__<key>__ prefix
    // "plan" and "outputs" are our own tool servers' keys: a connection with that key would replace them
    .refine((n) => !RESERVED_KEYS.includes(n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")), "That name is taken by a built-in tool; choose another"),
  url: publicHttpUrl,
  transport: Transport.default("http"),
  token: noNul(z.string().trim()).optional(), // sent as Authorization: Bearer <token>
  authType: z.enum(["none", "bearer", "oauth"]).optional(), // oauth: signed in through the server's own sign-in page
});
export type NewConnection = z.infer<typeof NewConnection>;

// Editing keeps the token unless a new one is typed; clearToken removes it.
export const ConnectionEdit = NewConnection.extend({ clearToken: z.boolean().optional() });
export type ConnectionEdit = z.infer<typeof ConnectionEdit>;

// Every function takes the workspace id first (from the session, never from the client).
export type ListConnections = (workspaceId: string) => Promise<Connection[]>;
export type SetConnectionEnabled = (workspaceId: string, id: string, enabled: boolean) => Promise<void>;
export type AddConnection = (workspaceId: string, input: NewConnection) => Promise<Connection>;
export type UpdateConnection = (workspaceId: string, id: string, input: ConnectionEdit) => Promise<Connection>;
export type DeleteConnection = (workspaceId: string, id: string) => Promise<void>;
// The server-side view, with the decrypted token and the OAuth state, only for building the agent's mcpServers.
export type ConnectionSecret = Connection & { token: string | null; oauth: unknown };
export type ListEnabledConnectionsWithSecrets = (workspaceId: string) => Promise<ConnectionSecret[]>;
/** After a run's init message: the status and the tool names each connection answered with. */
export type RecordConnectionSeen = (id: string, seen: { lastStatus: string; tools?: string[] }) => Promise<void>;
/** The OAuth module stores its state (client registration, encrypted tokens, expiry) through this. */
export type SetConnectionOAuth = (workspaceId: string, id: string, oauth: unknown) => Promise<void>;

// OAuth (MCP authorization: protected-resource discovery, dynamic client registration, PKCE).
/** Starts the sign-in: returns the server's authorization URL the browser is sent to. */
export type StartOAuth = (workspaceId: string, connectionId: string, redirectUri: string) => Promise<{ authorizeUrl: string }>;
/** The callback: exchanges the code, stores the tokens encrypted, returns the connection id. */
export type CompleteOAuth = (params: { code: string; state: string; redirectUri: string }) => Promise<{ workspaceId: string; connectionId: string }>;
/** The headers the agent's MCP client sends: a bearer token, or a fresh OAuth access token (refreshed if expired). */
export type AuthHeaders = (c: ConnectionSecret) => Promise<Record<string, string> | undefined>;
