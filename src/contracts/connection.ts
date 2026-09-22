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

export const NewConnection = z.object({
  name: z.string().trim().min(1, "Name it").max(40).regex(/^[A-Za-z0-9 _-]+$/, "Letters, digits, space, - and _"), // becomes the mcp__<key>__ prefix
  url: z.url("A full http(s) URL"),
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
