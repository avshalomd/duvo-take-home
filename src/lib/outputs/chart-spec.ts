import type { TopLevelSpec } from "vega-lite";
import type { z } from "zod";
import type { ChartInput } from "@/contracts/outputs";
import { CHAR_EM, CHART_HEIGHT, CHART_WIDTH, INNER_WIDTH, TEXT_PX, THEME, TITLE_PX, VALUE_LABELS } from "./chart-theme";
import { asNumber } from "./numbers";

export { ACCENT, CHART_HEIGHT, CHART_WIDTH } from "./chart-theme";

/** make_chart's arguments without the file name: everything the picture depends on. */
export type ChartArgs = Omit<z.infer<z.ZodObject<typeof ChartInput>>, "file">;
type Row = ChartArgs["data"][number];

const ROW_ORDER = "__row"; // a computed field: the double underscore keeps it clear of the agent's own field names
const LABEL = "__label"; // a computed field too: each value as it is written on its mark

const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

// What the category labels have to share: the chart minus its padding and the value axis (labels and title) on the left.
const PLOT_WIDTH = CHART_WIDTH - 2 * THEME.padding - 60;
const LEGEND_WIDTH = 80; // a series legend sits on the right and takes this from the plot
const LABEL_GAP_PX = 4; // the least space left between two level labels
const CHAR_PX = TEXT_PX * CHAR_EM;

// Values in the millions shortened on the axis: 84,700,000 is ten characters where 85M is three.
const SHORT_NUMBER =
  "abs(datum.value) >= 1e9 ? format(datum.value / 1e9, '~g') + 'B'" +
  " : abs(datum.value) >= 1e6 ? format(datum.value / 1e6, '~g') + 'M'" +
  " : abs(datum.value) >= 1e3 ? format(datum.value / 1e3, '~g') + 'k'" +
  " : format(datum.value, '~g')";

// How many title characters fit one line of the inner width, measured the way the renderer measures them.
const TITLE_CHARS = Math.floor(INNER_WIDTH / (TITLE_PX * CHAR_EM));

/** The title as it fits: one line, or two broken at a word. What still overflows ends in "..." (THEME.title.limit). */
function titleLines(title: string): string | string[] {
  if (title.length <= TITLE_CHARS) return title;
  const rest = title.split(/\s+/);
  let first = "";
  while (rest.length && `${first} ${rest[0]}`.trim().length <= TITLE_CHARS) first = `${first} ${rest.shift()}`.trim();
  if (!first) return title; // one word longer than the line: nothing to break at
  return [first, rest.join(" ")];
}

/**
 * A field name as the spec refers to it. Vega-Lite reads "revenue.usd" as usd inside revenue and "a[0]" as an index,
 * so every value came back undefined and nothing was drawn; a backslash makes them plain characters of the name.
 */
const ref = (field: string) => field.replace(/[.[\]]/g, "\\$&");

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
 * Level labels while every two neighbours fit side by side: each is centred on its own band, so they touch when half
 * of one plus half of the other is wider than a band. Otherwise slanted at 45 degrees and anchored at their end, so
 * each runs down-left from its own tick and cannot reach its neighbour.
 */
function categoryAxis(rows: Row[], field: string, withLegend: boolean) {
  const labels = [...new Set(rows.map((r) => String(r[field] ?? "")))];
  const band = (PLOT_WIDTH - (withLegend ? LEGEND_WIDTH : 0)) / labels.length;
  const fits = labels.every((l, i) => i === 0 || ((labels[i - 1].length + l.length) / 2) * CHAR_PX + LABEL_GAP_PX <= band);
  return fits ? { labelAngle: 0 } : { labelAngle: -45, labelAlign: "right" as const, labelBaseline: "middle" as const };
}

const DAY_MS = 86_400_000;
const MAX_DATE_STEPS = 4; // at most about five date labels: "Jan 2025" is some 70 px and they must not touch

/**
 * A date axis labelled by day for spans up to three months, by month up to three years, by year beyond, with ticks
 * only on those boundaries. The first render put ticks at noon and read "12 PM, 12 PM, 12 PM".
 */
function dateAxis(rows: Row[], field: string) {
  const times = rows.map((r) => Date.parse(String(r[field]))).filter((t) => Number.isFinite(t));
  const days = (Math.max(...times) - Math.min(...times)) / DAY_MS;
  const step = (units: number) => Math.max(1, Math.ceil(units / MAX_DATE_STEPS));
  if (days <= 92) return { format: "%b %-d", tickCount: { interval: "day" as const, step: step(days) } };
  if (days <= 3 * 366) return { format: "%b %Y", tickCount: { interval: "month" as const, step: step(days / 30.44) } };
  return { format: "%Y", tickCount: { interval: "year" as const, step: step(days / 365.25) } };
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
function xEncoding(rows: Row[], field: string, kind: "bar" | "line" | "area", withLegend: boolean) {
  const holds = fieldKind(rows, field);
  if (kind !== "bar" && holds === "date") {
    return {
      field: ref(field),
      type: "temporal" as const,
      title: null,
      scale: { type: "utc" as const }, // "2026-09-14" is a UTC midnight: in the server's own zone it moved off the day
      axis: { ...dateAxis(rows, field), labelAngle: 0 },
    };
  }
  if (kind !== "bar" && holds === "number") {
    const whole = rows.every((r) => r[field] === null || Number.isInteger(r[field]));
    return {
      field: ref(field),
      type: "quantitative" as const,
      title: null,
      scale: { zero: false }, // an x axis of years must not start at year 0
      // whole numbers are usually years or counts: "2024", not "2,024", and no tick at 2023.5
      ...(whole ? { axis: { format: "d", tickMinStep: 1, labelAngle: 0 } } : { axis: { labelAngle: 0 } }),
    };
  }
  return {
    field: ref(field),
    // text is a category; numbers on a bar chart (years) are categories too, and ordinal keeps them in order
    type: kind === "bar" && holds !== "number" ? ("nominal" as const) : ("ordinal" as const),
    sort: null, // the agent's order: the five largest stay largest-first
    title: null,
    axis: categoryAxis(rows, field, withLegend),
  };
}

// ---- values written on the marks (qa-ai F6) -------------------------------------------------------------------

const VALUE_GAP_PX = 4; // between a bar's end and its value
const POINT_GAP_PX = 8; // a point is drawn about 9 px across, so its value sits higher than a bar's
// What the plot has, roughly: the chart less its padding, the title and the category labels (about 60 px down, and
// up to the axis's labelLimit of 110 px across on a horizontal bar chart).
const PLOT_HEIGHT = CHART_HEIGHT - 2 * THEME.padding - 60;
const FLAT_PLOT_WIDTH = INNER_WIDTH - THEME.axis.labelLimit;
const MAX_ROOM = 0.4; // never give labels more than this share of the plot: the bars must still read

const DIGITS = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const SHORT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** A value as it is written on its mark: its digits (95,500), or short once the values reach the millions (84.7M), as the axis does. */
function valueLabel(value: number, largest: number): string {
  return largest >= 1e6 ? SHORT.format(value) : DIGITS.format(value);
}

/** The rows with each value's label beside it, in a field of its own, so the text mark reads it as it is. */
function withLabels(rows: Row[], y: string): Row[] {
  const largest = Math.max(0, ...rows.map((r) => (typeof r[y] === "number" ? Math.abs(r[y]) : 0)));
  return rows.map((r) => (typeof r[y] === "number" ? { ...r, [LABEL]: valueLabel(r[y], largest) } : r));
}

/**
 * The value scale stretched past the largest value by what its label needs, so the label of the tallest bar stays
 * inside the plot: above it, the title; past the longest horizontal bar, the chart's edge. Nothing to stretch when no
 * value is above zero.
 */
function roomForLabels(rows: Row[], y: string, direction: "up" | "across"): { scale?: { domainMax: number } } {
  const largest = Math.max(0, ...rows.map((r) => (typeof r[y] === "number" ? r[y] : 0)));
  if (largest <= 0) return {};
  const widest = Math.max(...rows.map((r) => String(r[LABEL] ?? "").length));
  const needed = direction === "up" ? TEXT_PX + VALUE_GAP_PX : widest * CHAR_PX + VALUE_GAP_PX;
  const share = Math.min(MAX_ROOM, needed / (direction === "up" ? PLOT_HEIGHT : FLAT_PLOT_WIDTH));
  return { scale: { domainMax: largest / (1 - share) } };
}

/**
 * The layer that writes each value: above its bar or point, or just past the end of a horizontal bar. aria false:
 * the marks under it already carry each value for a screen reader and for the evaluator, and would say it twice.
 */
function labelLayer(place: "above-bar" | "above-point" | "after-bar") {
  const mark =
    place === "after-bar"
      ? { type: "text" as const, aria: false, align: "left" as const, baseline: "middle" as const, dx: VALUE_GAP_PX }
      : { type: "text" as const, aria: false, baseline: "bottom" as const, dy: -(place === "above-bar" ? VALUE_GAP_PX : POINT_GAP_PX) };
  return { name: VALUE_LABELS, mark, encoding: { text: { field: LABEL, type: "nominal" as const } } };
}

/**
 * One mark, or the mark and its labels as two layers over the same encodings. The mark's own encodings (a series'
 * colour) stay on its layer, so a label is written in the text colour, not in its bar's.
 */
function drawn(shared: object, mark: object, own: object, labels: ReturnType<typeof labelLayer> | null) {
  return labels ? { encoding: shared, layer: [{ mark, encoding: own }, labels] } : { mark, encoding: { ...shared, ...own } };
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
  const read = args.data.map((row) => {
    const out: Row = { ...row };
    for (const f of numeric) out[f] = asNumber(row[f]);
    return out;
  });
  if (!read.some((r) => typeof r[y] === "number")) {
    throw new Error(`The field "${y}" holds no numbers, so there is nothing to draw. Send the values as numbers.`);
  }
  // a pie's legend names its slices, and a number in each would sit on a coloured slice: labels are for the rest
  const labelled = args.labels === true && kind !== "pie";
  const values = labelled ? withLabels(read, y) : read;
  const room = (direction: "up" | "across"): { scale?: { domainMax: number } } => (labelled ? roomForLabels(values, y, direction) : {});
  const labels = (place: Parameters<typeof labelLayer>[0]) => (labelled ? labelLayer(place) : null);

  // the agent's own title keeps the unit the instructions gave ("Sales (euros)"); otherwise the field in words
  const yEnc = { field: ref(y), type: "quantitative" as const, title: args.y_title?.trim() || words(y), axis: valueAxis(values, y) };
  const color = series ? { color: { field: ref(series), type: "nominal" as const, title: words(series) } } : {};
  const base = {
    title: { text: titleLines(title) },
    data: { values },
    config: THEME,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    autosize: { type: "fit" as const, contains: "padding" as const }, // the SVG is exactly this size, whatever the axes need
  };

  switch (kind) {
    case "bar": {
      // grouped, not stacked: with a series each value is read on its own against the axis
      const shared = { x: xEncoding(values, x, kind, Boolean(series)), y: { ...yEnc, ...room("up") }, ...(series ? { xOffset: { field: ref(series) } } : {}) };
      return { ...base, ...drawn(shared, { type: "bar" }, color, labels("above-bar")) } as TopLevelSpec;
    }
    case "horizontal-bar": {
      // The same fields as a bar chart, turned: categories down the side (level labels, so no slanting), values along
      // the bottom. The value axis keeps its title and short numbers; the category axis needs none.
      const category = { field: ref(x), type: fieldKind(values, x) === "number" ? ("ordinal" as const) : ("nominal" as const), sort: null, title: null };
      // about five ticks: numbers sit side by side along the bottom, and ten of them ran together ("80 90")
      const value = { ...yEnc, axis: { labelAngle: 0, tickCount: 5, ...valueAxis(values, y) }, ...room("across") };
      const shared = { y: category, x: value, ...(series ? { yOffset: { field: ref(series) } } : {}) };
      return { ...base, ...drawn(shared, { type: "bar" }, color, labels("after-bar")) } as TopLevelSpec;
    }
    case "line":
    case "area": {
      const mark = kind === "line" ? { type: "line", point: true } : { type: "area", opacity: 0.85 };
      const shared = { x: xEncoding(values, x, kind, Boolean(series)), y: { ...yEnc, ...room("up") } };
      return { ...base, ...drawn(shared, mark, color, labels(kind === "line" ? "above-point" : "above-bar")) } as TopLevelSpec;
    }
    case "scatter": {
      const shared = {
        // x is a quantity here, so it keeps its title, under level labels (titlePadding from the theme)
        x: { field: ref(x), type: "quantitative", title: words(x), scale: { zero: false }, axis: { labelAngle: 0, titlePadding: 12, ...valueAxis(values, x) } },
        y: { ...yEnc, scale: { zero: false, ...room("up").scale } },
      };
      return { ...base, ...drawn(shared, { type: "point", filled: true }, color, labels("above-point")) } as TopLevelSpec;
    }
    case "pie":
      return {
        ...base,
        mark: { type: "arc", innerRadius: 60 }, // a ring reads calmer than a solid pie
        // Vega-Lite stacks slices by the colour field's name; the row number keeps them in the agent's order instead
        transform: [{ window: [{ op: "row_number", as: ROW_ORDER }] }],
        encoding: {
          theta: { field: ref(y), type: "quantitative", stack: true },
          color: { field: ref(x), type: "nominal", sort: null, title: words(x) }, // the legend in the same order
          order: { field: ROW_ORDER, type: "quantitative" },
        },
      } as TopLevelSpec;
  }
}
