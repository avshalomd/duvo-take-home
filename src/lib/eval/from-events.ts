import { SheetFile } from "@/contracts/eval";
import type { RunEvent } from "@/contracts/run";

// What the evaluator reads from a run's events besides its files. Pure, so the live run (agent/run.ts) and a stored
// one (run-rows.ts, for Re-evaluate and the suite) are read the same way.

/**
 * Tools that bring outside text into a run: the web, and any connection. mcp__plan and mcp__outputs are our own
 * servers, and Read and Write stay in the run's own directory.
 */
export const readsOutside = (tool: string) =>
  tool === "WebFetch" || tool === "WebSearch" || (tool.startsWith("mcp__") && !/^mcp__(plan|outputs)__/.test(tool));

/**
 * The start of each page, search result and connection answer the run read (the event keeps ~300 characters of it),
 * with the tool it came from, in order: what a number in the report can be held to (qa-ai F2). A failed call read
 * nothing.
 */
export function whatItRead(events: RunEvent[]): { tool: string; text: string }[] {
  const toolOf = new Map<string, string>();
  const read: { tool: string; text: string }[] = [];
  for (const e of events) {
    if (e.kind === "tool_call") toolOf.set(e.payload.tool_use_id, e.payload.name);
    if (e.kind !== "tool_result" || e.payload.is_error) continue;
    const tool = toolOf.get(e.payload.tool_use_id);
    if (tool && readsOutside(tool) && e.payload.preview.trim()) read.push({ tool, text: e.payload.preview });
  }
  return read;
}

/**
 * What each spreadsheet holds: the spreadsheet tool's input, which our code turns into the .xlsx as it is (qa-ai F1).
 * The last call per file wins, because a fix writes the file again under the same name.
 */
export function spreadsheetsIn(events: RunEvent[]): SheetFile[] {
  const byFile = new Map<string, SheetFile>();
  for (const e of events) {
    if (e.kind !== "tool_call" || !e.payload.name.endsWith("__make_spreadsheet")) continue;
    const parsed = SheetFile.safeParse(e.payload.input);
    if (parsed.success) byFile.set(parsed.data.file, { file: parsed.data.file, sheets: parsed.data.sheets });
  }
  return [...byFile.values()];
}
