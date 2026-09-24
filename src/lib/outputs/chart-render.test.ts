import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderChartSvg } from "./chart-render";
import { buildChartSpec, CHART_HEIGHT, CHART_WIDTH } from "./chart-spec";

const countries = [
  { country: "Germany", population: 83.4 },
  { country: "France", population: 68.4 },
  { country: "Italy", population: 58.9 },
];

// Rendering runs vega headlessly in Node (no canvas, no browser), so these tests are the proof it works on a server.
describe("renderChartSvg", () => {
  it("renders a bar chart to a standalone SVG document that carries the title and the category labels", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "EU population", kind: "bar", data: countries, x: "country", y: "population" }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"'); // opens on its own, in a browser or an <img>
    expect(svg).toContain("EU population");
    expect(svg).toContain("Germany");
  });

  it("renders every kind without a browser", async () => {
    for (const kind of ["bar", "horizontal-bar", "line", "area", "pie", "scatter"] as const) {
      const data = [
        { a: 1, b: 2 },
        { a: 2, b: 5 },
      ];
      const svg = await renderChartSvg(buildChartSpec({ title: `A ${kind} chart`, kind, data, x: "a", y: "b" }));
      expect(svg).toContain(`A ${kind} chart`);
    }
  });

  it("renders every kind at exactly the chart size, axes and legend included, so a tile scales it predictably", async () => {
    for (const kind of ["bar", "line", "area", "pie", "scatter"] as const) {
      const data = [
        { a: "Germany", b: 84_700_000, s: "2024" },
        { a: "France", b: 68_400_000, s: "2024" },
      ];
      const svg = await renderChartSvg(buildChartSpec({ title: "Size", kind, data, x: kind === "scatter" ? "b" : "a", y: "b", series: "s" }));
      expect(svg).toMatch(new RegExp(`^<svg[^>]* width="${CHART_WIDTH}" height="${CHART_HEIGHT}"`));
    }
  });

  // Without a canvas, vega guesses every character at 0.8 em; the system font runs 0.45-0.6 em (measured in Chromium).
  // The guess cut "The five largest EU countries" to "The five largest EU c..." and sized the plot for text not there.
  it("measures text at the system font's width, so a title line that fits the chart is drawn whole", async () => {
    const svg = await renderChartSvg(
      buildChartSpec({ title: "The five largest EU countries by population", kind: "bar", data: countries, x: "country", y: "population" }),
    );
    expect(svg).toContain(">The five largest EU countries<");
    expect(svg).not.toContain("…");
  });

  // Q141: a white slab in a dark tile. The chart is transparent and carries its colours for both schemes.
  it("renders on a transparent background, with no opaque rectangle behind the chart", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "EU population", kind: "bar", data: countries, x: "country", y: "population" }));
    expect(svg).not.toMatch(/^<svg[^>]*>(<style>[\s\S]*?<\/style>)?<rect/); // vega draws its background as the first rect
    expect(svg).not.toContain('fill="#FFFFFF"/>');
  });

  it("carries a style block with a dark-scheme section, so an <img> of it follows the viewer's scheme", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "EU population", kind: "pie", data: countries, x: "country", y: "population" }));
    expect(svg).toMatch(/^<svg[^>]*><style>/);
    expect(svg).toContain("@media (prefers-color-scheme: dark)");
  });

  // Vega-Lite reads "revenue.usd" as the field usd inside revenue: every value was undefined and nothing was drawn.
  it("draws one mark per row when a field name has a dot or brackets in it", async () => {
    const data = [
      { "region.name": "North", "year.n": 2024, "revenue[usd]": 10 },
      { "region.name": "South", "year.n": 2025, "revenue[usd]": 20 },
    ];
    const marks = { bar: "bar", "horizontal-bar": "bar", pie: "arc mark", line: "point", scatter: "point" } as const;
    for (const [kind, mark] of Object.entries(marks) as [keyof typeof marks, string][]) {
      const x = kind === "scatter" ? "year.n" : "region.name";
      const svg = await renderChartSvg(buildChartSpec({ title: "Revenue", kind, data, x, y: "revenue[usd]" }));
      expect(svg.split(`aria-roledescription="${mark}"`).length - 1, kind).toBe(2);
    }
  });

  it("says on the svg element how many data rows it was drawn from, so the chart check can see a chart that drew none", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "EU population", kind: "bar", data: countries, x: "country", y: "population" }));
    expect(svg).toMatch(/^<svg[^>]* data-rows="3"/);
  });

  // qa-ai F6: "show each bar's value on top of it"
  it("writes each value on its bar in the chart's text size, and the bars stay the only marks read as data", async () => {
    const data = [
      { quarter: "Q1", sales: 80000 },
      { quarter: "Q2", sales: 95500 },
    ];
    const svg = await renderChartSvg(buildChartSpec({ title: "Sales", kind: "bar", data, x: "quarter", y: "sales", labels: true, y_title: "Sales (euros)" }));
    const labels = svg.match(/<g class="mark-text role-mark value_labels_marks"[^>]*>([\s\S]*?)<\/g>/)?.[1] ?? "";
    expect(labels).toMatch(/font-size="15px"[^>]*>80,000</);
    expect(labels).toContain(">95,500<");
    expect(labels).toContain('fill="#17202B"'); // graphite, switched to its dark twin by the style block
    expect(svg.split('aria-roledescription="bar"').length - 1).toBe(2);
    expect(svg).toContain("Y-axis titled 'Sales (euros)'");
  });

  it("escapes the title, so an ampersand from the agent cannot break the SVG", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "Sales & costs", kind: "bar", data: countries, x: "country", y: "population" }));
    expect(svg).toContain("Sales &amp; costs");
  });

  // vega is an ES module with a top-level await inside, which CommonJS cannot require(). A tsx script (the seed, a
  // worker running runAutomation) loads this repo's .ts files as CommonJS, and a static import there crashed at load.
  it("renders from a CommonJS caller such as a tsx script", async () => {
    const here = (f: string) => JSON.stringify(path.resolve("src/lib/outputs", f));
    const code = `const { renderChartSvg } = require(${here("chart-render.ts")});
      const { buildChartSpec } = require(${here("chart-spec.ts")});
      renderChartSvg(buildChartSpec({ title: "From tsx", kind: "bar", data: [{ a: "x", b: 1 }], x: "a", y: "b" }))
        .then((svg) => console.log(svg.slice(0, 4)));`;
    const { stdout } = await promisify(execFile)(path.resolve("node_modules/.bin/tsx"), ["-e", code], { timeout: 30_000 });
    expect(stdout.trim()).toBe("<svg");
  }, 40_000);
});
