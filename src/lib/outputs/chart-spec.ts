import type { TopLevelSpec } from "vega-lite";
import type { z } from "zod";
import type { ChartInput } from "@/contracts/outputs";
import { asNumber } from "./numbers";

/** make_chart's arguments without the file name: everything the picture depends on. */
export type ChartArgs = Omit<z.infer<z.ZodObject<typeof ChartInput>>, "file">;
type Row = ChartArgs["data"][number];

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 360;

// One accent for a single series; the companions only appear when a series splits the data into groups.
export const ACCENT = "#2563eb";
const PALETTE = [ACCENT, "#f59e0b", "#10b981", "#8b5cf6", "#f43f5e", "#64748b", "#0891b2", "#ea580c"];

// A calm, readable default: white background, no frame, grey text, light grid lines, the title on top at the left.
const THEME = {
  background: "#ffffff",
  padding: 16,
  font: "Helvetica, Arial, sans-serif",
  view: { stroke: null },
  title: { anchor: "start", fontSize: 16, fontWeight: 600, color: "#111827", offset: 16 },
  axis: {
    labelFontSize: 12,
    labelColor: "#4b5563",
    labelLimit: 160,
    titleFontSize: 12,
    titleFontWeight: 500,
    titleColor: "#374151",
    gridColor: "#eceef1",
    domainColor: "#d1d5db",
    tickColor: "#d1d5db",
  },
  axisX: { grid: false },
  legend: { labelFontSize: 12, labelColor: "#4b5563", titleFontSize: 12, titleColor: "#374151" },
  range: { category: PALETTE },
  mark: { color: ACCENT },
  bar: { cornerRadiusEnd: 3 },
  line: { strokeWidth: 2 },
  point: { size: 60 },
} as const;

const ROW_ORDER = "__row"; // a computed field: the double underscore keeps it clear of the agent's own field names

const ISO_DATE =/^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/** What a field holds, read from its values: numbers, ISO dates or text. Nulls do not count either way. */
function fieldKind(rows: Row[], field: string): "number" | "date" | "text" {
  const values = rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
  if (values.length && values.every((v) => typeof v === "number")) return "number";
  if (values.length && values.every((v) => typeof v === "string" && ISO_DATE.test(v))) return "date";
  return "text";
}

/** The x encoding of a line, area or scatter chart, chosen from what x holds. */
function continuousX(rows: Row[], field: string) {
  const kind = fieldKind(rows, field);
  if (kind === "date") return { field, type: "temporal" as const };
  if (kind === "number") {
    const whole = rows.every((r) => r[field] === null || Number.isInteger(r[field]));
    return {
      field,
      type: "quantitative" as const,
      scale: { zero: false }, // an x axis of years must not start at year 0
      // whole numbers are usually years or counts: "2024", not "2,024", and no tick at 2023.5
      ...(whole ? { axis: { format: "d", tickMinStep: 1 } } : {}),
    };
  }
  return { field, type: "ordinal" as const, sort: null }; // text on x ("Jan", "Q1"): keep the order the agent gave
}

/** A bar chart's category axis: the agent's order, and slanted labels only when they would collide. */
function categoryX(rows: Row[], field: string) {
  const labels = rows.map((r) => String(r[field] ?? ""));
  const crowded = labels.length > 12 || labels.some((l) => l.length > 10);
  return {
    field,
    type: fieldKind(rows, field) === "number" ? ("ordinal" as const) : ("nominal" as const), // years as bars are categories
    sort: null, // the agent's order: the five largest stay largest-first
    axis: { labelAngle: crowded ? -40 : 0 },
  };
}

function requireField(rows: Row[], field: string) {
  if (rows.some((r) => field in r)) return;
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(", ");
  throw new Error(`The data has no field "${field}". Its fields are: ${fields}.`);
}

/**
 * A Vega-Lite spec for one chart, as plain data: the chart kind picks the mark and the encodings, the values decide
 * the axis types. Pure, so every choice here is tested without rendering anything.
 */
export function buildChartSpec(args: ChartArgs): TopLevelSpec {
  const { kind, x, y, series, title } = args;
  for (const field of [x, y, ...(series ? [series] : [])]) requireField(args.data, field);

  // Numbers the agent sent as text ("83.4") are read as numbers, on y and on a scatter's x; everything else as sent.
  const numeric = kind === "scatter" ? [x, y] : [y];
  const values = args.data.map((row) => {
    const out: Row = { ...row };
    for (const f of numeric) out[f] = asNumber(row[f]);
    return out;
  });
  if (!values.some((r) => typeof r[y] === "number")) {
    throw new Error(`The field "${y}" holds no numbers, so there is nothing to draw. Send the values as numbers.`);
  }

  const yEnc = { field: y, type: "quantitative" as const };
  const color = series ? { color: { field: series, type: "nominal" as const } } : {};
  const base = { title: { text: title }, data: { values }, config: THEME, width: 640, height: 360 };

  switch (kind) {
    case "bar":
      return {
        ...base,
        mark: { type: "bar" },
        // grouped, not stacked: with a series each value is read on its own against the axis
        encoding: { x: categoryX(values, x), y: yEnc, ...color, ...(series ? { xOffset: { field: series } } : {}) },
      } as TopLevelSpec;
    case "line":
      return { ...base, mark: { type: "line", point: true }, encoding: { x: continuousX(values, x), y: yEnc, ...color } } as TopLevelSpec;
    case "area":
      return { ...base, mark: { type: "area", opacity: 0.85 }, encoding: { x: continuousX(values, x), y: yEnc, ...color } } as TopLevelSpec;
    case "scatter":
      return {
        ...base,
        mark: { type: "point", filled: true },
        encoding: { x: { field: x, type: "quantitative", scale: { zero: false } }, y: { ...yEnc, scale: { zero: false } }, ...color },
      } as TopLevelSpec;
    case "pie":
      return {
        ...base,
        width: 360, // a pie is round: a square view
        height: 360,
        mark: { type: "arc", innerRadius: 70 }, // a ring reads calmer than a solid pie
        // Vega-Lite stacks slices by the colour field's name; the row number keeps them in the agent's order instead
        transform: [{ window: [{ op: "row_number", as: ROW_ORDER }] }],
        encoding: {
          theta: { field: y, type: "quantitative", stack: true },
          color: { field: x, type: "nominal", sort: null }, // the legend in the same order
          order: { field: ROW_ORDER, type: "quantitative" },
        },
      } as TopLevelSpec;
  }
}
