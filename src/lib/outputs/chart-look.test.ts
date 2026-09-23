import { describe, expect, it } from "vitest";
import { ACCENT, buildChartSpec, CHART_HEIGHT, CHART_WIDTH, type ChartArgs } from "./chart-spec";

// Q98: a chart is shown as a tile, scaled down to the tile's width. On a 390 px phone the tile is about 320 px wide
// once the sheet's and the tile's padding are taken off, and no text in it may end up smaller than 11 px there.
const TILE_WIDTH = 320;
const MIN_READABLE_PX = 11;

type Axis = Record<string, unknown>;
type Enc = { field?: string; title?: unknown; axis?: Axis | null };
type Loose = {
  title: { text: string | string[] };
  width: number;
  height: number;
  autosize: { type: string; contains: string };
  encoding: Record<string, Enc | undefined>;
  config: {
    font: string;
    padding: number;
    title: { fontSize: number; fontWeight: number; color: string };
    axis: { labelFontSize: number; titleFontSize: number; labelColor: string; gridColor: string; gridOpacity: number };
    legend: { labelFontSize: number; titleFontSize: number; symbolSize: number };
    range: { category: string[] };
    mark: { color: string };
  };
};
const spec = (args: ChartArgs) => buildChartSpec(args) as unknown as Loose;

const countries = [
  { country: "Germany", population: 84_700_000 },
  { country: "France", population: 68_400_000 },
  { country: "Italy", population: 58_900_000 },
  { country: "Spain", population: 48_600_000 },
  { country: "Poland", population: 37_600_000 },
];
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const byMonth = months.map((month, i) => ({ month, sales: 10 + i }));
const kinds = ["bar", "line", "area", "pie", "scatter"] as const;
const anyKind = (kind: (typeof kinds)[number]) => spec({ title: "T", kind, data: [{ a: 1, b: 2 }, { a: 2, b: 3 }], x: "a", y: "b" });

describe("chart readability in a small tile (Q98)", () => {
  it("draws every kind at one fixed size that includes the axes, legend and padding, so the tile's scale is known", () => {
    for (const kind of kinds) {
      const s = anyKind(kind);
      expect([s.width, s.height]).toEqual([CHART_WIDTH, CHART_HEIGHT]);
      expect(s.autosize).toEqual({ type: "fit", contains: "padding" }); // the SVG is exactly this size, not "this plus the axes"
    }
  });

  it("keeps every label, axis title and legend entry at 11 px or more when the chart is scaled into a 320 px tile", () => {
    const { axis, legend } = anyKind("bar").config;
    const scale = TILE_WIDTH / CHART_WIDTH;
    for (const size of [axis.labelFontSize, axis.titleFontSize, legend.labelFontSize, legend.titleFontSize]) {
      expect(size * scale).toBeGreaterThanOrEqual(MIN_READABLE_PX);
    }
  });

  it("gives the pie's legend readable swatches, not dots", () => {
    expect(anyKind("pie").config.legend.symbolSize).toBeGreaterThanOrEqual(120); // area in square px: about 11 px across
  });

  it("wraps a long title onto a second line at a word break, so it never squeezes the plot", () => {
    const s = spec({ title: "The five largest EU countries by population", kind: "bar", data: countries, x: "country", y: "population" }) as Loose & {
      title: { text: string | string[] };
    };
    expect(s.title.text).toEqual(["The five largest EU countries", "by population"]); // 30 characters a line at 21 px
    expect(spec({ title: "Fruit sold this week", kind: "bar", data: countries, x: "country", y: "population" }).title).toEqual({
      text: "Fruit sold this week",
    });
  });

  it("caps a title that is still too long at the chart's inner width, where it ends in an ellipsis", () => {
    const { title, padding } = anyKind("bar").config as Loose["config"] & { title: { limit: number } };
    expect(title.limit).toBe(CHART_WIDTH - 2 * padding);
  });

  it("sets the title larger and heavier than all other text", () => {
    const { title, axis } = anyKind("bar").config;
    expect(title.fontSize).toBeGreaterThanOrEqual(axis.labelFontSize * 1.35);
    expect(title.fontWeight).toBeGreaterThanOrEqual(600);
  });

  it("keeps short category labels level", () => {
    const s = spec({ title: "P", kind: "bar", data: countries, x: "country", y: "population" });
    expect(s.encoding.x?.axis).toMatchObject({ labelAngle: 0 });
  });

  it("slants crowded category labels and anchors them at their end, so neighbours never run into each other", () => {
    for (const kind of ["bar", "line"] as const) {
      const s = spec({ title: "Sales", kind, data: byMonth, x: "month", y: "sales" });
      expect(s.encoding.x?.axis).toMatchObject({ labelAngle: -45, labelAlign: "right" });
    }
  });

  it("draws no x-axis title on bar, line and area charts, so a title can never sit on a tick label", () => {
    for (const kind of ["bar", "line", "area"] as const) {
      expect(spec({ title: "P", kind, data: countries, x: "country", y: "population" }).encoding.x?.title).toBeNull();
    }
  });

  it("keeps the x-axis title on a scatter plot, where x is a quantity, below level labels with room between them", () => {
    const s = spec({ title: "P", kind: "scatter", data: [{ area: 357, people: 84 }, { area: 551, people: 68 }], x: "area", y: "people" });
    expect(s.encoding.x?.title).toBe("Area");
    expect(s.encoding.x?.axis).toMatchObject({ labelAngle: 0 });
    expect(Number(s.encoding.x?.axis?.titlePadding)).toBeGreaterThanOrEqual(10);
  });

  it("names the value axis in words: population_millions reads Population millions", () => {
    const s = spec({ title: "P", kind: "bar", data: [{ c: "DE", population_millions: 84.7 }], x: "c", y: "population_millions" });
    expect(s.encoding.y?.title).toBe("Population millions");
  });

  it("shortens values in the millions on the value axis: 90M, not 90,000,000", () => {
    const big = spec({ title: "P", kind: "bar", data: countries, x: "country", y: "population" });
    expect(String(big.encoding.y?.axis?.labelExpr)).toContain("'M'");
    const small = spec({ title: "P", kind: "bar", data: [{ c: "DE", p: 84.7 }], x: "c", y: "p" });
    expect(small.encoding.y?.axis?.labelExpr).toBeUndefined(); // small numbers keep their digits
  });
});

describe("the chart's look matches the app (DESIGN-V2)", () => {
  it("uses the system font, graphite text and hairline gridlines", () => {
    const { font, title, axis } = anyKind("bar").config;
    expect(font.startsWith("system-ui")).toBe(true);
    expect(title.color).toBe("#17202B");
    expect(axis.labelColor).toBe("#17202B");
    expect(axis.gridColor).toBe("#17202B");
    expect(axis.gridOpacity).toBeLessThanOrEqual(0.1); // graphite at 8%: the app's hairline
  });

  it("colours series saffron first, then fern, graphite, slate and crimson; a single series is saffron", () => {
    const { range, mark } = anyKind("bar").config;
    expect(range.category.slice(0, 5)).toEqual(["#E89A0C", "#15845A", "#17202B", "#5B6878", "#C62F43"]);
    expect(ACCENT).toBe("#E89A0C");
    expect(mark.color).toBe(ACCENT);
  });

  it("leaves generous padding around the chart", () => {
    expect(anyKind("bar").config.padding).toBeGreaterThanOrEqual(20);
  });
});
