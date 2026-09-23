import type { Connection } from "@/contracts/connection";
import type { connections } from "@/db/schema";

type Row = typeof connections.$inferSelect;

export function toConnection(_row: Row): Connection {
  throw new Error("not implemented yet");
}
export function readToken(_row: Row): string | null {
  throw new Error("not implemented yet");
}
export function oauthSignedIn(_oauth: unknown): boolean {
  throw new Error("not implemented yet");
}
