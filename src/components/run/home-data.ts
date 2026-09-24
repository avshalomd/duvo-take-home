import "server-only";
import { cache } from "react";
import type { Automation } from "@/contracts/automation";
import type { FileMeta, Run, RunEvent } from "@/contracts/run";
import { listAutomations } from "@/lib/automations/store";
import { listConnections } from "@/lib/connections/store";
import { getFile, getRun } from "@/lib/runs/queries";
import { getLimits, getUsage } from "@/lib/usage/budget";
import { startRefusal, type StartRefusal } from "@/lib/usage/budget-rule";
import type { CommandOption } from "./command-list";
import { describeOutput } from "./command-query";
import { csvSummary } from "./csv-summary";
import { carriedSheets, type Sheet } from "./file-kind";

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

export type ComposerData = { automations: CommandOption[]; notReady: number; connections: string[]; refusal: StartRefusal | null };

/**
 * What the composer offers: the ready automations, how many are not ready, the connections that are on, and whether
 * the workspace's limits refuse a start right now (UX QA U3), read as Settings > Limits reads them, so Run can be
 * refused in the box instead of handing the brief over to a sheet that snaps back. The start checks again: this is
 * what the page knew when it was drawn, and the server stays the authority.
 */
export async function composerProps(workspaceId: string): Promise<ComposerData> {
  const [{ all, ready }, connections, limits, usage] = await Promise.all([
    readyAutomations(workspaceId),
    connectionsOf(workspaceId),
    getLimits(workspaceId),
    getUsage(workspaceId),
  ]);
  return {
    automations: ready.map((a) => ({
      command: a.command,
      name: a.name,
      produces: describeOutput(a.template.expectedOutputs[0] ?? a.description, a.inputLabel), // Q118: no raw {input}
      hint: a.inputHint || a.inputLabel, // shown after the command until the input is typed (Q93)
    })),
    notReady: all.length - ready.length,
    connections: connections.filter((c) => c.enabled).map((c) => c.name),
    refusal: startRefusal(limits, usage),
  };
}

/** A tile's facts, by file name: a CSV's rows and columns, or the sheets of a spreadsheet a follow-up carried over. */
export type FileFacts = Record<string, { rows: number; columns: string[] } | { sheets: Sheet[] }>;

/** A run as Home has read it: enough to follow the chain of runs a follow-up continues. */
type ReadRun = { run: Pick<Run, "parentRunId">; events: RunEvent[] };

/**
 * What each tile says that the file's name cannot: the rows and columns of each CSV the run made, read once on the
 * server where the file is, and the sheets of each spreadsheet a follow-up carried over from the runs it continues
 * (Q205) - their events are on the server too, and the client only holds this run's. `parent` is the follow-up's
 * parent as Home already read it (for its title): it is not read a second time.
 */
export async function fileFacts(workspaceId: string, run: Pick<Run, "id" | "parentRunId">, files: FileMeta[], parent: ReadRun | null): Promise<FileFacts> {
  const csvs = files.filter((f) => f.name.toLowerCase().endsWith(".csv") && !f.quarantined); // a held-back file is not opened
  const [read, earlier] = await Promise.all([Promise.all(csvs.map((f) => getFile(workspaceId, run.id, f.name))), earlierEvents(workspaceId, parent)]);
  const facts: FileFacts = {};
  read.forEach((file, i) => {
    const summary = file ? csvSummary(file.content) : null;
    if (summary) facts[csvs[i].name] = summary;
  });
  for (const [name, sheets] of Object.entries(carriedSheets(files.map((f) => f.name), earlier))) facts[name] = { sheets };
  return facts;
}

const CHAIN = 5; // follow-ups of follow-ups: a few levels are plenty, and a loop in the data cannot run away

/** The events of the runs a follow-up continues, oldest first: its parent (already read), the parent's parent, and so on. */
async function earlierEvents(workspaceId: string, parent: ReadRun | null): Promise<RunEvent[]> {
  if (!parent) return [];
  const chain: RunEvent[][] = [parent.events];
  let parentId = parent.run.parentRunId ?? null;
  for (let i = 1; parentId && i < CHAIN; i++) {
    const earlier = await getRun(workspaceId, parentId);
    if (!earlier) break;
    chain.unshift(earlier.events);
    parentId = earlier.run.parentRunId ?? null;
  }
  return chain.flat();
}
