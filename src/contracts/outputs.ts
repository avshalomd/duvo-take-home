import { z } from "zod";

// Output tools (v2): the agent has no code execution, so charts and spreadsheets are made by in-process tools it
// calls with data; our code renders the file into the run directory. Write stays limited to .txt/.md/.csv.
const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const ChartInput = {
  file: z.string().regex(/^[\w-]{1,60}\.svg$/, "a file name ending in .svg"),
  title: z.string().max(120),
  kind: z.enum(["bar", "line", "area", "pie", "scatter"]),
  data: z.array(z.record(z.string(), Cell)).min(1).max(1000),
  x: z.string(), // field name for the x axis (or the category, for a pie)
  y: z.string(), // field name for the value
  series: z.string().optional(), // field name that splits the data into coloured series
};
export const SpreadsheetInput = {
  file: z.string().regex(/^[\w-]{1,60}\.xlsx$/, "a file name ending in .xlsx"),
  sheets: z
    .array(z.object({ name: z.string().min(1).max(31), columns: z.array(z.string()).min(1).max(50), rows: z.array(z.array(Cell)).max(5000) }))
    .min(1)
    .max(10),
};

export type OutputFile = { name: string; mime: string; bytes: number; content: string; encoding: "utf8" | "base64" };
/** Every file the run left in its directory that we serve: the Write tool's text files and the output tools' files. */
export type CollectFiles = (dir: string) => Promise<OutputFile[]>;
