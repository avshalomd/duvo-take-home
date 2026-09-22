import type { ConnectionSecret } from "@/contracts/connection";
import { connectionKey } from "@/lib/connections/key";
import { PLAN_SERVER_KEY } from "./plan-state";

/**
 * The init message reports each MCP server as "connected" or as the failure text; that is the only honest
 * evidence a connection worked. Match each one back to the connection row it was built from, by the same key
 * that named it, so the list can show the last status instead of optimism.
 */
export function statusUpdates(
  servers: { name: string; status: string }[],
  given: ConnectionSecret[],
): { id: string; lastStatus: string }[] {
  const byKey = new Map(given.map((c) => [connectionKey(c.name), c.id]));
  const updates: { id: string; lastStatus: string }[] = [];
  for (const s of servers) {
    if (s.name === PLAN_SERVER_KEY) continue; // the plan tool is ours, not one of the user's connections
    const id = byKey.get(s.name);
    if (id) updates.push({ id, lastStatus: s.status });
  }
  return updates;
}
