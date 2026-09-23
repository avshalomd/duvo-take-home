/**
 * The look of every chart, from the app's design (docs/DESIGN-V2.md): graphite text, hairline grid lines, the system
 * font, saffron as the first colour, on a transparent ground. Sized for the smallest place a chart is shown: a tile
 * on a 390 px phone, about 320 px wide, where the SVG is scaled down to fit.
 */

// The whole SVG, axes, legend and padding included (autosize "fit"). 320 / 420 = 0.76 is the smallest tile's scale.
export const CHART_WIDTH = 420;
export const CHART_HEIGHT = 280;

// All small text: 15 px in the SVG is 11.4 px in a 320 px tile, the least that still reads comfortably.
export const TEXT_PX = 15;
export const TITLE_PX = 21;
// The width of an average character, in em. Measured in Chromium, words in the system font run 0.45-0.6 em; the
// top of that range keeps every estimate on the safe side. The renderer, the title wrap and the label rule share it.
export const CHAR_EM = 0.6;
const PADDING = 20;
export const INNER_WIDTH = CHART_WIDTH - 2 * PADDING;

// The design's tokens, light and dark. The SVG is drawn in the light ones; its style block (chart-style.ts) switches
// every one of them to its dark value when the viewer's scheme is dark.
export const TOKENS = {
  graphite: { light: "#17202B", dark: "#E6EBF2" },
  slate: { light: "#5B6878", dark: "#98A4B3" },
  saffron: { light: "#E89A0C", dark: "#F5B437" },
  fern: { light: "#15845A", dark: "#3CC489" },
  crimson: { light: "#C62F43", dark: "#F0697A" },
  paper: { light: "#FFFFFF", dark: "#151C26" },
} as const;
const GRAPHITE = TOKENS.graphite.light;
const SLATE = TOKENS.slate.light;
const SAFFRON = TOKENS.saffron.light;

export const ACCENT = SAFFRON; // a single series is saffron, the app's colour for what the agent made
// The design's five series colours in order; the style block maps each to its dark twin.
export const SERIES = [TOKENS.saffron, TOKENS.fern, TOKENS.graphite, TOKENS.slate, TOKENS.crimson];
// After the five, lighter tints of the first three, so a sixth pie slice never repeats a colour (readable in both).
const PALETTE = [...SERIES.map((t) => t.light), "#F4C56A", "#7CC4A2", "#8A95A3"];

export const THEME = {
  // the tile's own colour, light or dark, shows through (Q141); vega's SVG writer draws no rectangle for "transparent"
  background: "transparent",
  padding: PADDING,
  font: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  view: { stroke: null }, // no box around the plot
  // limit: a title wider than the chart made "fit" shrink the plot to make room for it; past this it ends in "..."
  title: { anchor: "start", fontSize: TITLE_PX, fontWeight: 600, color: GRAPHITE, offset: 14, limit: INNER_WIDTH },
  axis: {
    labelFontSize: TEXT_PX,
    labelColor: GRAPHITE,
    labelPadding: 6,
    labelLimit: 110, // a longer label ends in an ellipsis instead of pushing the plot aside
    titleFontSize: TEXT_PX,
    titleFontWeight: 400,
    titleColor: SLATE,
    titlePadding: 12,
    gridColor: GRAPHITE,
    gridOpacity: 0.08, // the app's hairline: graphite at 8%
    domainColor: GRAPHITE,
    domainOpacity: 0.2,
    ticks: false,
  },
  axisX: { grid: false },
  axisY: { domain: false }, // the grid lines carry the values; a vertical rule would add nothing
  legend: {
    labelFontSize: TEXT_PX,
    labelColor: GRAPHITE,
    titleFontSize: TEXT_PX,
    titleFontWeight: 400,
    titleColor: SLATE,
    symbolType: "circle",
    symbolSize: 150, // square px: a swatch about 14 px across, 10 px in the smallest tile
    rowPadding: 6,
  },
  range: { category: PALETTE },
  mark: { color: ACCENT },
  bar: { cornerRadiusEnd: 4 },
  line: { strokeWidth: 2.5 },
  point: { size: 70, opacity: 0.9 }, // Vega-Lite's default 0.7 left saffron points pale on paper
  arc: { stroke: TOKENS.paper.light, strokeWidth: 2 }, // a thin paper seam between slices
} as const;
