import type { TopLevelSpec } from "vega-lite";

/**
 * A Vega-Lite spec rendered to an SVG string, headlessly: Vega-Lite compiles to a Vega spec, and a Vega View with
 * renderer "none" draws nothing on screen but can still export SVG. No canvas and no browser, so it runs in a
 * serverless function.
 */
export async function renderChartSvg(spec: TopLevelSpec): Promise<string> {
  // Loaded on first use, not at the top: vega is an ES module with a top-level await inside, which a CommonJS caller
  // (a tsx script, a worker) cannot require(). A static import made every importer of the run loop crash at load.
  const [{ parse, View }, { compile }] = await Promise.all([import("vega"), import("vega-lite")]);
  const view = new View(parse(compile(spec).spec), { renderer: "none" });
  try {
    return await view.toSVG();
  } finally {
    view.finalize(); // releases the view's timers and listeners; one view per chart
  }
}
