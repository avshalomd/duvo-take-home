import { SERIES, TOKENS } from "./chart-theme";

/**
 * The chart's colours for both schemes, as a style block inside the SVG (Q141). An SVG in an <img> is its own
 * document, so the page's CSS cannot reach it; its own @media (prefers-color-scheme) follows the viewer's scheme,
 * and a downloaded chart opened on its own does the same.
 *
 * vega writes colours as attributes (fill="#17202B"), and any CSS rule beats an attribute. Text, axes and grid are
 * picked by the class vega gives them; the data marks and legend swatches by the light colour they were drawn in.
 */
const TEXT = ".role-title-text text, .role-axis-label text, .role-legend-label text";
const QUIET_TEXT = ".role-axis-title text, .role-legend-title text"; // axis and legend titles: slate, like secondary text

function scheme(tone: "light" | "dark"): string {
  const hairline = tone === "light" ? `stroke: ${TOKENS.graphite.light}; stroke-opacity: 0.08;` : "stroke: #FFFFFF; stroke-opacity: 0.09;";
  const baseline = tone === "light" ? `stroke: ${TOKENS.graphite.light};` : "stroke: #FFFFFF;";
  return [
    `${TEXT} { fill: ${TOKENS.graphite[tone]}; }`,
    `${QUIET_TEXT} { fill: ${TOKENS.slate[tone]}; }`,
    `.role-axis-grid line { ${hairline} }`, // the app's hairline: graphite at 8% on light, white at 9% on dark
    `.role-axis-domain line { ${baseline} stroke-opacity: 0.2; }`,
  ].join(" ");
}

// Every series colour to its dark twin, as a fill (bars, slices, points, swatches) and as a stroke (lines).
const darkSeries = SERIES.map((t) => `[fill="${t.light}"] { fill: ${t.dark}; } [stroke="${t.light}"] { stroke: ${t.dark}; }`).join(" ");

export const CHART_CSS = [
  ":root { color-scheme: light dark; }", // a chart opened on its own gets a dark page in dark mode, not white under light text
  scheme("light"),
  "@media (prefers-color-scheme: dark) {",
  scheme("dark"),
  darkSeries,
  `[stroke="${TOKENS.paper.light}"] { stroke: ${TOKENS.paper.dark}; }`, // the pie's seams, in the dark paper colour
  "}",
].join(" ");

/** The SVG with the style block as its first child, before anything it styles. */
export function styleSvg(svg: string): string {
  return svg.replace(/^<svg[^>]*>/, (open) => `${open}<style>${CHART_CSS}</style>`);
}
