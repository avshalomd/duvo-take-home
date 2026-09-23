import type { RunEvent } from "@/contracts/run";
import { connectionKey } from "@/lib/connections/key";

// A connection's tools reach the agent as mcp__<key>__<tool>, with the key made from its name by connectionKey().
// Both functions match through that key, so "DeepWiki" in a template and "deepwiki" in a trace are the same thing.

/**
 * The workspace connections a run actually called, by their names in Settings. Code reads this from the trace rather
 * than asking the model which connections a draft needs: a tool call is evidence, a model's guess is not.
 */
export function usedConnections(events: RunEvent[], connections: { name: string }[]): string[] {
  const calledKeys = new Set(
    events.flatMap((e) => (e.kind === "tool_call" && e.payload.name.startsWith("mcp__") ? [e.payload.name.split("__")[1]] : [])),
  );
  return connections.filter((c) => calledKeys.has(connectionKey(c.name))).map((c) => c.name); // our own plan/outputs servers match no connection
}

/** The required connections that are not on in this workspace (off, or not there at all), in the template's words. */
export function missingConnections(required: string[], connections: { name: string; enabled: boolean }[]): string[] {
  const on = new Set(connections.filter((c) => c.enabled).map((c) => connectionKey(c.name)));
  return required.filter((name) => !on.has(connectionKey(name)));
}
