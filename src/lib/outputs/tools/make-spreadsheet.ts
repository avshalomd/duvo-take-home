import { writeFile } from "node:fs/promises";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SpreadsheetInput } from "@/contracts/outputs";
import { outputPath } from "../file-name";
import { workbookBuffer } from "../spreadsheet";
import { answer, failure, issues } from "./result";

const Args = z.object(SpreadsheetInput);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** make_spreadsheet: validates the arguments, writes <file> as an .xlsx into the run directory, answers in one line. */
export async function makeSpreadsheet(dir: string, input: unknown): Promise<CallToolResult> {
  const parsed = Args.safeParse(input);
  if (!parsed.success) return failure((input as { file?: unknown })?.file, new Error(issues(parsed.error)));
  const args = parsed.data;
  try {
    const target = outputPath(dir, args.file, ".xlsx");
    await writeFile(target, await workbookBuffer(args.sheets));
    const rows = args.sheets.reduce((sum, s) => sum + s.rows.length, 0);
    return answer(`Wrote ${args.file} (${plural(args.sheets.length, "sheet")}, ${plural(rows, "row")})`);
  } catch (err) {
    return failure(args.file, err);
  }
}

export const makeSpreadsheetTool = (dir: string) =>
  tool(
    "make_spreadsheet",
    "Save tables as an Excel .xlsx file in your working directory. Use it when the user asks for Excel, .xlsx or a " +
      "spreadsheet (for a .csv, use Write). One sheet per table: a name, the column headers, and the rows as arrays " +
      "in column order. Send numbers as numbers so the user can sum and sort them.",
    SpreadsheetInput,
    (args) => makeSpreadsheet(dir, args),
  );
