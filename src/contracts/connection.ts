import { z } from "zod";

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
});
export type Connection = z.infer<typeof Connection>;

// Only a public http(s) host: the SDK child fetches this URL server-side, so loopback, link-local and private
// ranges would turn a connection into a request into our own network (QA round 3, Q46).
const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|metadata\.google)/i;
export const publicHttpUrl = z
  .url("Give the server's full address, starting with https://")
  .refine((u) => /^https?:\/\//i.test(u), "Only http:// or https:// addresses can be connected")
  .refine((u) => { try { return !PRIVATE_HOST.test(new URL(u).hostname); } catch { return false; } }, "That address points at a private or local network, which a connection cannot reach");

export const NewConnection = z.object({
  name: z.string().trim().min(1, "Give the server a name").max(40, "Keep the name under 40 characters").regex(/^[A-Za-z0-9 _-]+$/, "Use letters, digits, spaces, - and _ only"), // becomes the mcp__<key>__ prefix
  url: publicHttpUrl,
  transport: Transport.default("http"),
  token: z.string().trim().optional(), // sent as Authorization: Bearer <token>
});
export type NewConnection = z.infer<typeof NewConnection>;

export type ListConnections = () => Promise<Connection[]>;
export type SetConnectionEnabled = (id: string, enabled: boolean) => Promise<void>;
export type AddConnection = (input: NewConnection) => Promise<Connection>;
// The server-side view, with the token, only for building the agent's mcpServers option.
export type ConnectionSecret = Connection & { token: string | null };
export type ListEnabledConnectionsWithSecrets = () => Promise<ConnectionSecret[]>;
