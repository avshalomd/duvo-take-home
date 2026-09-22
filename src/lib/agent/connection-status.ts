import type { ConnectionSecret } from "@/contracts/connection";

// STUB - the init message's mcp server statuses, matched back to the connection rows they were built from.
export function statusUpdates(
  _servers: { name: string; status: string }[],
  _given: ConnectionSecret[],
): { id: string; lastStatus: string }[] {
  return [];
}
