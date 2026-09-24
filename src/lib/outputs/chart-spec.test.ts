import { describe, expect, it } from "vitest";
import { ACCENT, buildChartSpec, type ChartArgs } from "./chart-spec";

// The spec is plain data, so the tests read it as such rather than through vega-lite's large union type.
type Enc = { field?: string; type?: string; title?: unknown; sort?: unknown; stack?: unknown; axis?: Record<string, unknown>; scale?: Record<string, unknown> };
type Loose = {
  title: { text: string };
  mark: { type: string; point?: boolean; filled?: boolean; innerRadius?: number };
  encoding: Record<string, Enc | undefined>;
  data: { values: Record<string, unknown>[] };
  config: { mark: { color: string }; title: { anchor: string } };
};
const spec = (args: ChartArgs) => buildChartSpec(args) as unknown as Loose;

const countries = [
  { country: "Germany", population: 83.4 },
  { country: "France", population: 68.4 },
  { country: "Italy", population: 58.9 },
];

describe("buildChartSpec", () => {
  it("draws a bar chart with one bar per category, in the order the data gives", () => {
    const s = spec({ title: "Population", kind: "bar", data: countries, x: "country", y: "population" });
    expect(s.mark.type).toBe("bar");
    expect(s.encoding.x).toMatchObject({ field: "country", type: "nominal", sort: null }); // sort: null keeps the agent's order
    expect(s.encoding.y).toMatchObject({ field: "population", type: "quantitative" });
    expect(s.encoding.color).toBeUndefined(); // one series: every bar in the accent colour
  });

  it("draws horizontal bars: the categories down the side in the data's order, the values along the bottom", () => {
    const s = spec({ title: "Population", kind: "horizontal-bar", data: countries, x: "country", y: "population" });
    expect(s.mark.type).toBe("bar");
    expect(s.encoding.y).toMatchObject({ field: "country", type: "nominal", sort: null });
    expect(s.encoding.x).toMatchObject({ field: "population", type: "quantitative" });
    // numbers side by side along the bottom: ten ticks put "80" against "90" (production, 2026-09-23)
    expect(s.encoding.x?.axis).toMatchObject({ tickCount: 5 });
  });

  // Vega-Lite reads a dot or brackets in a field name as a path into nested data: "revenue.usd" is usd inside revenue.
  it("escapes dots and brackets in every field it refers to, and keeps the data's own names as sent", () => {
    const data = [{ "region.name": "North", "revenue[usd]": 10, "plan.tier": "a" }];
    const s = spec({ title: "Revenue", kind: "bar", data, x: "region.name", y: "revenue[usd]", series: "plan.tier" });
    expect(s.encoding.x?.field).toBe("region\\.name");
    expect(s.encoding.y?.field).toBe("revenue\\[usd\\]");
    expect(s.encoding.color?.field).toBe("plan\\.tier");
    expect(s.encoding.xOffset?.field).toBe("plan\\.tier");
    expect(Object.keys(s.data.values[0])).toEqual(["region.name", "revenue[usd]", "plan.tier"]);
    const pie = spec({ title: "Revenue", kind: "pie", data, x: "region.name", y: "revenue[usd]" });
    expect(pie.encoding.theta?.field).toBe("revenue\\[usd\\]");
    expect(pie.encoding.color?.field).toBe("region\\.name");
  });

  it("groups the bars side by side when a series splits them", () => {
    const data = [
      { year: "2023", country: "DE", gdp: 4.1 },
      { year: "2024", country: "DE", gdp: 4.2 },
    ];
    const s = spec({ title: "GDP", kind: "bar", data, x: "country", y: "gdp", series: "year" });
    expect(s.encoding.color).toMatchObject({ field: "year", type: "nominal" });
    expect(s.encoding.xOffset).toMatchObject({ field: "year" }); // grouped, not stacked: each value is read on its own
  });

  it("draws a line with points, on a time axis when x holds dates", () => {
    const data = [
      { day: "2026-09-01", visits: 10 },
      { day: "2026-09-02", visits: 14 },
    ];
    const s = spec({ title: "Visits", kind: "line", data, x: "day", y: "visits" });
    expect(s.mark).toMatchObject({ type: "line", point: true });
    expect(s.encoding.x).toMatchObject({ field: "day", type: "temporal" });
  });

  it("puts whole-number years on a numeric axis without thousands separators and without forcing zero", () => {
    const data = [
      { year: 2019, sales: 5 },
      { year: 2024, sales: 9 },
    ];
    const s = spec({ title: "Sales", kind: "line", data, x: "year", y: "sales" });
    expect(s.encoding.x).toMatchObject({ type: "quantitative", axis: { format: "d" }, scale: { zero: false } });
  });

  it("colours each line of a multi-series line chart", () => {
    const data = [
      { month: "Jan", city: "Paris", temp: 5 },
      { month: "Jan", city: "Rome", temp: 9 },
    ];
    const s = spec({ title: "Temperatures", kind: "line", data, x: "month", y: "temp", series: "city" });
    expect(s.encoding.color).toMatchObject({ field: "city" });
    expect(s.encoding.x).toMatchObject({ type: "ordinal", sort: null }); // text on x: kept in the given order
  });

  it("draws an area chart", () => {
    const s = spec({ title: "Load", kind: "area", data: [{ t: 1, load: 3 }, { t: 2, load: 4 }], x: "t", y: "load" });
    expect(s.mark.type).toBe("area");
    expect(s.encoding.y).toMatchObject({ field: "load", type: "quantitative" });
  });

  it("draws a pie as slices sized by y and coloured by x, with no axes", () => {
    const s = spec({ title: "Share", kind: "pie", data: countries, x: "country", y: "population" });
    expect(s.mark.type).toBe("arc");
    expect(s.encoding.theta).toMatchObject({ field: "population", type: "quantitative" });
    expect(s.encoding.color).toMatchObject({ field: "country", type: "nominal" });
    expect(s.encoding.x).toBeUndefined();
    expect(s.encoding.y).toBeUndefined();
  });

  it("stacks the pie's slices in the agent's order, not alphabetically, so the largest-first list reads clockwise", () => {
    const s = spec({ title: "Share", kind: "pie", data: countries, x: "country", y: "population" }) as Loose & {
      transform: { window: { op: string; as: string }[] }[];
    };
    const rowNumber = s.transform[0].window[0];
    expect(rowNumber.op).toBe("row_number");
    expect(s.encoding.order).toMatchObject({ field: rowNumber.as });
  });

  it("draws a scatter plot with two numeric axes and filled points", () => {
    const data = [
      { area: 357, population: 83.4 },
      { area: 551, population: 68.4 },
    ];
    const s = spec({ title: "Area and people", kind: "scatter", data, x: "area", y: "population" });
    expect(s.mark).toMatchObject({ type: "point", filled: true });
    expect(s.encoding.x).toMatchObject({ field: "area", type: "quantitative" });
    expect(s.encoding.y).toMatchObject({ field: "population", type: "quantitative" });
  });

  it("reads numbers the agent sent as text, so a y of \"83.4\" is still a bar of 83.4", () => {
    const s = spec({ title: "P", kind: "bar", data: [{ c: "DE", p: "83.4" }], x: "c", y: "p" });
    expect(s.data.values[0].p).toBe(83.4);
  });

  it("puts the title on top, left-aligned, and uses the one accent colour for a single series", () => {
    const s = spec({ title: "EU population", kind: "bar", data: countries, x: "country", y: "population" }); // long titles wrap: chart-look.test.ts
    expect(s.title.text).toBe("EU population");
    expect(s.config.title.anchor).toBe("start");
    expect(s.config.mark.color).toBe(ACCENT);
  });

  it("refuses a field the data does not have, and names the fields it does have", () => {
    expect(() => buildChartSpec({ title: "P", kind: "bar", data: countries, x: "country", y: "pop" })).toThrow(
      /no field "pop".*country, population/,
    );
  });

  it("refuses a y field with no numbers in it, because there is nothing to draw", () => {
    expect(() => buildChartSpec({ title: "P", kind: "bar", data: [{ c: "DE", p: "many" }], x: "c", y: "p" })).toThrow(/numbers/);
  });
});

// qa-ai F6: "show the numbers on the bars" is a common office ask, and the tool could not; nor did the agent keep the
// unit the instructions gave ("in euros") in the axis title.
describe("buildChartSpec - values on the chart and the value axis's title", () => {
  type Layer = { mark: { type: string; aria?: boolean; baseline?: string; align?: string }; encoding?: Record<string, Enc | undefined> };
  type Layered = Loose & { layer: Layer[] };
  const layered = (args: ChartArgs) => buildChartSpec(args) as unknown as Layered;
  const sales = [
    { quarter: "Q1", sales: 80000 },
    { quarter: "Q2", sales: 95500 },
    { quarter: "Q3", sales: 101250.5 },
  ];
  const labelsOf = (s: Layered) => s.data.values.map((r) => r[String(s.layer[1].encoding?.text?.field)]);

  it("writes each value above its bar when labels are asked for, the bars drawn as before", () => {
    const s = layered({ title: "Sales", kind: "bar", data: sales, x: "quarter", y: "sales", labels: true });
    expect(s.layer.map((l) => l.mark.type)).toEqual(["bar", "text"]);
    expect(s.layer[1].mark).toMatchObject({ baseline: "bottom" });
    expect(s.layer[1].encoding?.text).toMatchObject({ type: "nominal" });
    expect(labelsOf(s)).toEqual(["80,000", "95,500", "101,250.5"]);
    expect(s.encoding.x).toMatchObject({ field: "quarter" }); // shared by the bars and their labels
  });

  it("draws no labels unless they are asked for", () => {
    const s = spec({ title: "Sales", kind: "bar", data: sales, x: "quarter", y: "sales" });
    expect((s as unknown as { layer?: unknown }).layer).toBeUndefined();
    expect(s.mark.type).toBe("bar");
  });

  it("leaves room above the tallest bar for its label, so it never reaches the title", () => {
    const s = layered({ title: "Sales", kind: "bar", data: sales, x: "quarter", y: "sales", labels: true });
    expect(Number(s.encoding.y?.scale?.domainMax)).toBeGreaterThan(101250.5 * 1.08);
  });

  it("writes a horizontal bar's value just past its end, with room on the right for it", () => {
    const s = layered({ title: "Sales", kind: "horizontal-bar", data: sales, x: "quarter", y: "sales", labels: true });
    expect(s.layer[1].mark).toMatchObject({ type: "text", align: "left", baseline: "middle" });
    expect(Number(s.encoding.x?.scale?.domainMax)).toBeGreaterThan(101250.5 * 1.08);
  });

  it("writes values over the points of a line, an area and a scatter plot", () => {
    for (const kind of ["line", "area", "scatter"] as const) {
      const data = [
        { a: 1, b: 2 },
        { a: 2, b: 5 },
      ];
      const marks = layered({ title: "T", kind, data, x: "a", y: "b", labels: true }).layer.map((l) => l.mark.type);
      expect(marks, kind).toEqual([kind === "scatter" ? "point" : kind, "text"]);
    }
  });

  it("shortens labels in the millions the way the axis does: 84.7M", () => {
    const data = [
      { c: "DE", p: 84_700_000 },
      { c: "FR", p: 68_400_000 },
    ];
    expect(labelsOf(layered({ title: "P", kind: "bar", data, x: "c", y: "p", labels: true }))).toEqual(["84.7M", "68.4M"]);
  });

  it("colours a series' bars but writes every label in the text colour, beside its own bar", () => {
    const data = [
      { q: "Q1", y: "2024", v: 1 },
      { q: "Q1", y: "2025", v: 2 },
    ];
    const s = layered({ title: "T", kind: "bar", data, x: "q", y: "v", series: "y", labels: true });
    expect(s.layer[0].encoding?.color).toMatchObject({ field: "y" });
    expect(s.layer[1].encoding?.color).toBeUndefined();
    expect(s.encoding.xOffset).toMatchObject({ field: "y" }); // shared: a label sits over its own bar of the group
  });

  // The bars carry each value for a screen reader and for the evaluator (eval/file-view.ts); labels would say it twice.
  it("keeps the labels out of what a screen reader reads as data", () => {
    expect(layered({ title: "Sales", kind: "bar", data: sales, x: "quarter", y: "sales", labels: true }).layer[1].mark.aria).toBe(false);
  });

  it("writes no labels on a pie, whose legend names the slices", () => {
    const s = spec({ title: "Share", kind: "pie", data: sales, x: "quarter", y: "sales", labels: true });
    expect((s as unknown as { layer?: unknown }).layer).toBeUndefined();
  });

  it("titles the value axis as the agent asks, unit included, and in the field's words otherwise", () => {
    expect(spec({ title: "S", kind: "bar", data: sales, x: "quarter", y: "sales", y_title: "Sales (euros)" }).encoding.y?.title).toBe("Sales (euros)");
    const flat = spec({ title: "S", kind: "horizontal-bar", data: sales, x: "quarter", y: "sales", y_title: "Sales (euros)" });
    expect(flat.encoding.x?.title).toBe("Sales (euros)");
    expect(spec({ title: "S", kind: "bar", data: sales, x: "quarter", y: "sales" }).encoding.y?.title).toBe("Sales");
  });
});
