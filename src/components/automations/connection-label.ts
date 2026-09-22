export type ConnectionTone = "ok" | "idle" | "warn" | "bad";

// The dot and the words beside a connection: what the last run saw, said in the user's language.
export function connectionStatus(lastStatus: string | null): { label: string; tone: ConnectionTone } {
  throw new Error("not implemented");
}
