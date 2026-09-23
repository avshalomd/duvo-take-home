import { describe, expect, it } from "vitest";
import { renderChartSvg } from "./chart-render";
import { buildChartSpec } from "./chart-spec";

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
    for (const kind of ["bar", "line", "area", "pie", "scatter"] as const) {
      const data = [
        { a: 1, b: 2 },
        { a: 2, b: 5 },
      ];
      const svg = await renderChartSvg(buildChartSpec({ title: `A ${kind} chart`, kind, data, x: "a", y: "b" }));
      expect(svg).toContain(`A ${kind} chart`);
    }
  });

  it("escapes the title, so an ampersand from the agent cannot break the SVG", async () => {
    const svg = await renderChartSvg(buildChartSpec({ title: "Sales & costs", kind: "bar", data: countries, x: "country", y: "population" }));
    expect(svg).toContain("Sales &amp; costs");
  });
});
