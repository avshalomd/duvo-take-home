import { describe, expect, it } from "vitest";
import { ACCENT, buildChartSpec, type ChartArgs } from "./chart-spec";

// The spec is plain data, so the tests read it as such rather than through vega-lite's large union type.
type Enc = { field?: string; type?: string; sort?: unknown; stack?: unknown; axis?: Record<string, unknown>; scale?: Record<string, unknown> };
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
