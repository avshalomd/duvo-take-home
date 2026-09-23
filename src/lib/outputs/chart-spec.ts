import type { TopLevelSpec } from "vega-lite";
import type { z } from "zod";
import type { ChartInput } from "@/contracts/outputs";
import { CHART_HEIGHT, CHART_WIDTH, INNER_WIDTH, TEXT_PX, THEME, TITLE_PX } from "./chart-theme";
import { asNumber } from "./numbers";

export { ACCENT, CHART_HEIGHT, CHART_WIDTH } from "./chart-theme";

/** make_chart's arguments without the file name: everything the picture depends on. */
export type ChartArgs = Omit<z.infer<z.ZodObject<typeof ChartInput>>, "file">;
type Row = ChartArgs["data"][number];

const ROW_ORDER = "__row"; // a computed field: the double underscore keeps it clear of the agent's own field names

const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

// What the category labels have to share: the chart minus its padding and the value axis on the left.
const PLOT_WIDTH = CHART_WIDTH - 2 * THEME.padding - 70;
const CHAR_PX = TEXT_PX * 0.5; // an average character of the system font; a rough estimate is enough to decide

// Values in the millions shortened on the axis: 84,700,000 is ten characters where 85M is three.
const SHORT_NUMBER =
  "abs(datum.value) >= 1e9 ? format(datum.value / 1e9, '~g') + 'B'" +
  " : abs(datum.value) >= 1e6 ? format(datum.value / 1e6, '~g') + 'M'" +
  " : abs(datum.value) >= 1e3 ? format(datum.value / 1e3, '~g') + 'k'" +
  " : format(datum.value, '~g')";

// How many title characters fit one line of the inner width, at an average of 0.55 em per character.
const TITLE_CHARS = Math.floor(INNER_WIDTH / (TITLE_PX * 0.55));

/** The title as it fits: one line, or two broken at a word. What still overflows ends in "..." (THEME.title.limit). */
function titleLines(title: string): string | string[] {
  if (title.length <= TITLE_CHARS) return title;
  const rest = title.split(/\s+/);
  let first = "";
  while (rest.length && `${first} ${rest[0]}`.trim().length <= TITLE_CHARS) first = `${first} ${rest.shift()}`.trim();
  if (!first) return title; // one word longer than the line: nothing to break at
  return [first, rest.join(" ")];
}

/** A field name as an axis or legend title: population_millions reads "Population millions". */
function words(field: string): string {
  const spaced = field.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** What a field holds, read from its values: numbers, ISO dates or text. Nulls do not count either way. */
function fieldKind(rows: Row[], field: string): "number" | "date" | "text" {
  const values = rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined);
  if (values.length && values.every((v) => typeof v === "number")) return "number";
  if (values.length && values.every((v) => typeof v === "string" && ISO_DATE.test(v))) return "date";
  return "text";
}

/**
 * Level labels while the longest one fits its share of the width; otherwise slanted at 45 degrees and anchored at
 * their end, so each label runs down-left from its own tick and cannot touch its neighbour.
 */
function categoryAxis(rows: Row[], field: string) {
  const labels = [...new Set(rows.map((r) => String(r[field] ?? "")))];
  const longest = Math.max(...labels.map((l) => l.length));
  const fits = longest * CHAR_PX <= (PLOT_WIDTH / labels.length) * 0.9; // 10% air between neighbours
  return fits ? { labelAngle: 0 } : { labelAngle: -45, labelAlign: "right" as const, labelBaseline: "middle" as const };
}

/** A value axis: short numbers when they reach the millions, the digits as they are below that. */
function valueAxis(rows: Row[], field: string) {
  const largest = Math.max(0, ...rows.map((r) => (typeof r[field] === "number" ? Math.abs(r[field]) : 0)));
  return largest >= 1e6 ? { labelExpr: SHORT_NUMBER } : undefined;
}

/**
 * The x encoding of a bar, line or area chart. It has no axis title: the labels (countries, months, years) say what
 * they are and the chart's title says the rest, and a title under slanted labels is what landed on top of them (Q98).
 */
function xEncoding(rows: Row[], field: string, kind: "bar" | "line" | "area") {
  const holds = fieldKind(rows, field);
  if (kind !== "bar" && holds === "date") return { field, type: "temporal" as const, title: null };
  if (kind !== "bar" && holds === "number") {
    const whole = rows.every((r) => r[field] === null || Number.isInteger(r[field]));
    return {
      field,
      type: "quantitative" as const,
      title: null,
      scale: { zero: false }, // an x axis of years must not start at year 0
      // whole numbers are usually years or counts: "2024", not "2,024", and no tick at 2023.5
      ...(whole ? { axis: { format: "d", tickMinStep: 1, labelAngle: 0 } } : { axis: { labelAngle: 0 } }),
    };
  }
  return {
    field,
    // text is a category; numbers on a bar chart (years) are categories too, and ordinal keeps them in order
    type: kind === "bar" && holds !== "number" ? ("nominal" as const) : ("ordinal" as const),
    sort: null, // the agent's order: the five largest stay largest-first
    title: null,
    axis: categoryAxis(rows, field),
  };
}

function requireField(rows: Row[], field: string) {
  if (rows.some((r) => field in r)) return;
  const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))].join(", ");
  throw new Error(`The data has no field "${field}". Its fields are: ${fields}.`);
}

/**
 * A Vega-Lite spec for one chart, as plain data: the chart kind picks the mark and the encodings, the values decide
 * the axis types and labels. Pure, so every choice here is tested without rendering anything.
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

  const yEnc = { field: y, type: "quantitative" as const, title: words(y), axis: valueAxis(values, y) };
  const color = series ? { color: { field: series, type: "nominal" as const, title: words(series) } } : {};
  const base = {
    title: { text: titleLines(title) },
    data: { values },
    config: THEME,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    autosize: { type: "fit" as const, contains: "padding" as const }, // the SVG is exactly this size, whatever the axes need
  };

  switch (kind) {
    case "bar":
      return {
        ...base,
        mark: { type: "bar" },
        // grouped, not stacked: with a series each value is read on its own against the axis
        encoding: { x: xEncoding(values, x, kind), y: yEnc, ...color, ...(series ? { xOffset: { field: series } } : {}) },
      } as TopLevelSpec;
    case "line":
      return { ...base, mark: { type: "line", point: true }, encoding: { x: xEncoding(values, x, kind), y: yEnc, ...color } } as TopLevelSpec;
    case "area":
      return { ...base, mark: { type: "area", opacity: 0.85 }, encoding: { x: xEncoding(values, x, kind), y: yEnc, ...color } } as TopLevelSpec;
    case "scatter":
      return {
        ...base,
        mark: { type: "point", filled: true },
        encoding: {
          // x is a quantity here, so it keeps its title, under level labels (titlePadding from the theme)
          x: { field: x, type: "quantitative", title: words(x), scale: { zero: false }, axis: { labelAngle: 0, titlePadding: 12, ...valueAxis(values, x) } },
          y: { ...yEnc, scale: { zero: false } },
          ...color,
        },
      } as TopLevelSpec;
    case "pie":
      return {
        ...base,
        mark: { type: "arc", innerRadius: 60 }, // a ring reads calmer than a solid pie
        // Vega-Lite stacks slices by the colour field's name; the row number keeps them in the agent's order instead
        transform: [{ window: [{ op: "row_number", as: ROW_ORDER }] }],
        encoding: {
          theta: { field: y, type: "quantitative", stack: true },
          color: { field: x, type: "nominal", sort: null, title: words(x) }, // the legend in the same order
          order: { field: ROW_ORDER, type: "quantitative" },
        },
      } as TopLevelSpec;
  }
}
