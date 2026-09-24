import { SheetFile } from "@/contracts/eval";
import type { RunEvent } from "@/contracts/run";

// What the evaluator reads from a run's events besides its files. Pure, so the live run (agent/run.ts) and a stored
// one (run-rows.ts, for Re-evaluate and the suite) are read the same way.

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
