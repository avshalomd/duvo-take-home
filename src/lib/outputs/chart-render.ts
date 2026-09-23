import type { TopLevelSpec } from "vega-lite";
import { CHAR_EM } from "./chart-theme";

// vega's text measure: exported at runtime, missing from its type declarations, hence the cast where it is used.
type TextMetrics = { width: (item: { fontSize?: number; limit?: number }, text: unknown) => number };

/**
 * Text width without a canvas. vega's own guess is 0.8 em a character, a third wider than the system font, and every
 * layout decision follows it: titles were cut short and the plot was shrunk for text that was not there. A text
 * with a limit is drawn cut to that limit, so it is never wider than it.
 */
function textWidth(item: { fontSize?: number; limit?: number }, text: unknown): number {
  const width = CHAR_EM * (item.fontSize ?? 11) * String(text ?? "").trim().length; // 11: vega's default font size
  return item.limit && item.limit > 0 ? Math.min(width, item.limit) : width;
}

/**
 * A Vega-Lite spec rendered to an SVG string, headlessly: Vega-Lite compiles to a Vega spec, and a Vega View with
 * renderer "none" draws nothing on screen but can still export SVG. No canvas and no browser, so it runs in a
 * serverless function.
 */
export async function renderChartSvg(spec: TopLevelSpec): Promise<string> {
  // Loaded on first use, not at the top: vega is an ES module with a top-level await inside, which a CommonJS caller
  // (a tsx script, a worker) cannot require(). A static import made every importer of the run loop crash at load.
  const [vega, { compile }] = await Promise.all([import("vega"), import("vega-lite")]);
  // vega's documented hook for a custom measure; set on every call, which is idempotent and keeps it next to its use
  (vega as unknown as { textMetrics: TextMetrics }).textMetrics.width = textWidth;
  const view = new vega.View(vega.parse(compile(spec).spec), { renderer: "none" });
  try {
    return await view.toSVG();
  } finally {
    view.finalize(); // releases the view's timers and listeners; one view per chart
  }
}
