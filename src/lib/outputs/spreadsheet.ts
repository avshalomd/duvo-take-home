import type { z } from "zod";
import type { SpreadsheetInput } from "@/contracts/outputs";

export type SheetArgs = z.infer<typeof SpreadsheetInput.sheets>;

export async function workbookBuffer(_sheets: SheetArgs): Promise<Buffer> {
  throw new Error("not built yet");
}
