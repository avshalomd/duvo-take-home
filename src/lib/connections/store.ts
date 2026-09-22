import type { AddConnection, Connection, ListConnections, ListEnabledConnectionsWithSecrets, SetConnectionEnabled } from "@/contracts/connection";
import fixture from "../../../fixtures/connections.json";

// Fixture-backed until the connections package replaces it with the connections table.
const rows: Connection[] = fixture
  .filter((c) => c.transport === "http" || c.transport === "sse")
  .map((c) => ({ id: c.id, name: c.name, url: c.url as string, transport: c.transport as Connection["transport"], hasToken: false, enabled: c.enabled, lastStatus: c.last_status ?? null }));
export const listConnections: ListConnections = async () => rows; // STUB
export const setConnectionEnabled: SetConnectionEnabled = async () => { throw new Error("not implemented: setConnectionEnabled"); }; // STUB
export const addConnection: AddConnection = async () => { throw new Error("not implemented: addConnection"); }; // STUB
export const listEnabledConnectionsWithSecrets: ListEnabledConnectionsWithSecrets = async () => rows.filter((r) => r.enabled).map((r) => ({ ...r, token: null })); // STUB
