import type { TopLevelSpec } from "vega-lite";
import type { z } from "zod";
import type { ChartInput } from "@/contracts/outputs";

type Shape = typeof ChartInput;
export type ChartArgs = { [K in Exclude<keyof Shape, "file">]: z.infer<Shape[K]> };

export const ACCENT = "";

export function buildChartSpec(_args: ChartArgs): TopLevelSpec {
  throw new Error("not built yet");
}
