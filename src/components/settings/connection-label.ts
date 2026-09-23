export type ConnectionTone = "ok" | "idle" | "warn" | "bad";

// The dot and the words beside a connection: what the last run saw, said in the user's language.
export function connectionStatus(lastStatus: string | null): { label: string; tone: ConnectionTone } {
  if (lastStatus === null) return { label: "never used", tone: "idle" };
  if (lastStatus === "connected") return { label: "connected", tone: "ok" };
  // the store and the SDK each have a word for "no credentials"; the user needs the action, not the enum
  if (["not_configured", "needs-auth", "needs_auth"].includes(lastStatus))
    return { label: "needs a token before a run can use it", tone: "warn" };
  return { label: lastStatus, tone: "bad" }; // a failure keeps the server's own words: the reason is the useful part
}

/**
 * What the Connections list says beside a server. A missing sign-in or token comes first: until it is fixed, what
 * the last run saw no longer matters, and the words say what to do next.
 */
export function connectionState(c: {
  authType?: "none" | "bearer" | "oauth";
  hasToken: boolean;
  signedIn?: boolean;
  lastStatus: string | null;
}): { label: string; tone: ConnectionTone } {
  if (c.authType === "oauth" && !c.signedIn) return { label: "needs you to sign in", tone: "warn" };
  if (c.authType === "bearer" && !c.hasToken) return { label: "needs a token before a run can use it", tone: "warn" };
  return connectionStatus(c.lastStatus);
}

/** "12 tools". The tool names come from a run's first message, so before any run there is nothing to count. */
export function toolCount(n: number): string {
  if (n === 0) return "tools show after the first run";
  return n === 1 ? "1 tool" : `${n} tools`;
}

/** "read_wiki_structure" -> "read wiki structure": the name as words, for a reader who is not a developer. */
export function toolWords(name: string): string {
  return name.replace(/[_-]+/g, " ").trim();
}
