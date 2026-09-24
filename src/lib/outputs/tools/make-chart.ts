import { writeFile } from "node:fs/promises";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ChartInput } from "@/contracts/outputs";
import { renderChartSvg } from "../chart-render";
import { buildChartSpec } from "../chart-spec";
import { outputPath } from "../file-name";
import { answer, failure, issues } from "./result";

const Args = z.object(ChartInput);

// What the agent is shown. The SDK cannot turn the contract's z.record into JSON Schema: tools/list then fails and
// the agent sees no output tools at all (the first live run). An object with a catchall states the same rule - any
// field name, each value a cell - and converts cleanly. The contract's own schema still validates every call below.
const Row = z.object({}).catchall(ChartInput.data.element.valueType);
const Advertised = { ...ChartInput, data: z.array(Row).min(1).max(1000) };

/**
 * make_chart: the agent passes the data, our code draws it. Validates the arguments itself (the tests and any
 * future caller need not go through the SDK), writes <file> into the run directory and answers in one line.
 */
export async function makeChart(dir: string, input: unknown): Promise<CallToolResult> {
  const parsed = Args.safeParse(input);
  if (!parsed.success) return failure((input as { file?: unknown })?.file, new Error(issues(parsed.error)));
  const args = parsed.data;
  try {
    const target = outputPath(dir, args.file, ".svg");
    const svg = await renderChartSvg(buildChartSpec(args));
    await writeFile(target, svg, "utf8");
    const points = args.data.length;
    // the agent is told what was drawn, so its report never claims values on a pie that has none (qa-ai F6)
    const labels = !args.labels ? "" : args.kind === "pie" ? "; values are not written on a pie: its legend names the slices" : ", each value written on the chart";
    return answer(`Wrote ${args.file} (${args.kind} chart, ${points} ${points === 1 ? "point" : "points"}${labels})`);
  } catch (err) {
    return failure(args.file, err);
  }
}

export const makeChartTool = (dir: string) =>
  tool(
    "make_chart",
    "Draw a chart and save it as an .svg file in your working directory; the user can download it and sees it in the run. " +
      "Use it whenever the user asks for a chart, graph or plot: you cannot draw one any other way. " +
      "kind: bar, horizontal-bar, line, area, pie or scatter. data: one object per point, values as numbers. " +
      "x names the field for the categories or the horizontal axis (the slice label, for a pie), y the field for the value; " +
      "a horizontal-bar chart takes the same fields as bar and draws the categories down the side, which suits long names. " +
      "series (optional) a field that splits the data into coloured groups. The order of data is kept. " +
      "labels: true writes each value on its bar or point (not on a pie); use it whenever the user wants to see the numbers. " +
      'y_title (optional) titles the value axis; put the unit in it when the instructions give one, e.g. "Sales (euros)".',
    Advertised,
    (args) => makeChart(dir, args),
  );
