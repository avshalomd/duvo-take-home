import "server-only";
import { cache } from "react";
import type { Automation } from "@/contracts/automation";
import type { FileMeta } from "@/contracts/run";
import { listAutomations } from "@/lib/automations/store";
import { listConnections } from "@/lib/connections/store";
import { getFile } from "@/lib/runs/queries";
import type { CommandOption } from "./command-list";
import { describeOutput } from "./command-query";
import { csvSummary } from "./csv-summary";

// What Home reads besides its runs: the workspace's automations (for the command list, the tokens and the runs'
// titles and tags), the connections that are on, and the facts on each CSV tile. Server only.

/**
 * The workspace's automations, read once per request however many parts of the page ask (cache): the rail and
 * the main column both need them. They only add names and commands, so Home still opens if they cannot load.
 */
export const readyAutomations = cache(async (workspaceId: string) => {
  const all = await listAutomations(workspaceId).catch((): Automation[] => []);
  return { all, ready: all.filter((a) => a.status === "active") }; // a draft or a switched-off one cannot be called
});

/** An automation's id to its name (for run titles) and to its command (for the rail's tags). */
export function titles(all: Automation[]): { names: Record<string, string>; commands: Record<string, string> } {
  return {
    names: Object.fromEntries(all.map((a) => [a.id, a.name])),
    commands: Object.fromEntries(all.map((a) => [a.id, a.command])),
  };
}

/** The workspace's connections, read once per request: the composer shows the ones on, Details names them all. */
export const connectionsOf = cache(listConnections);

export type ComposerData = { automations: CommandOption[]; notReady: number; connections: string[] };

/** What the composer offers: the ready automations, how many are not ready, and the connections that are on. */
export async function composerProps(workspaceId: string): Promise<ComposerData> {
  const [{ all, ready }, connections] = await Promise.all([readyAutomations(workspaceId), connectionsOf(workspaceId)]);
  return {
    automations: ready.map((a) => ({
      command: a.command,
      name: a.name,
      produces: describeOutput(a.template.expectedOutputs[0] ?? a.description, a.inputLabel), // Q118: no raw {input}
      hint: a.inputHint || a.inputLabel, // shown after the command until the input is typed (Q93)
    })),
    notReady: all.length - ready.length,
    connections: connections.filter((c) => c.enabled).map((c) => c.name),
  };
}

export type FileFacts = Record<string, { rows: number; columns: string[] }>;

/** The rows and columns of each CSV the run made, for its tile. Read once, on the server, where the file is. */
export async function fileFacts(workspaceId: string, runId: string, files: FileMeta[]): Promise<FileFacts> {
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv") && !f.quarantined); // a held-back file is not opened
  const read = await Promise.all(csvs.map((f) => getFile(workspaceId, runId, f.name)));
  const facts: FileFacts = {};
  read.forEach((file, i) => {
    const summary = file ? csvSummary(file.content) : null;
    if (summary) facts[csvs[i].name] = summary;
  });
  return facts;
}
