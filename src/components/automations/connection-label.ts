export type ConnectionTone = "ok" | "idle" | "warn" | "bad";

// The dot and the words beside a connection: what the last run saw, said in the user's language.
export function connectionStatus(lastStatus: string | null): { label: string; tone: ConnectionTone } {
  if (lastStatus === null) return { label: "never used", tone: "idle" };
  if (lastStatus === "connected") return { label: "connected", tone: "ok" };
  // the store's own word for a server with no credentials; the user needs the action, not the enum
  if (lastStatus === "not_configured") return { label: "needs a token", tone: "warn" };
  return { label: lastStatus, tone: "bad" }; // a failure keeps the server's own words: the reason is the useful part
}
