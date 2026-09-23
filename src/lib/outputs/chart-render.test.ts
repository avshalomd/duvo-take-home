import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
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
