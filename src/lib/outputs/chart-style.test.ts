import { describe, expect, it } from "vitest";
import { CHART_CSS, styleSvg } from "./chart-style";

// Q141: the chart carries its own colours for both schemes. Light is the first part, dark the @media block.
const [light, dark = ""] = CHART_CSS.split("@media (prefers-color-scheme: dark)");
/** A rule for `selector` (possibly one of a list) that sets `declaration`. */
const rule = (selector: string, declaration: string) =>
  new RegExp(`${selector.replace(/[.[\]"#]/g, (c) => `\\${c}`)}[^{]*\\{[^}]*${declaration.replace(/[.#]/g, (c) => `\\${c}`)}`);

describe("the chart's style block (Q141)", () => {
  it("colours titles, labels, axis titles, grid and legend with the light tokens", () => {
    expect(light).toMatch(rule(".role-title-text text", "fill: #17202B"));
    expect(light).toMatch(rule(".role-axis-label text", "fill: #17202B"));
    expect(light).toMatch(rule(".role-legend-label text", "fill: #17202B"));
    expect(light).toMatch(rule(".role-axis-title text", "fill: #5B6878"));
    expect(light).toMatch(rule(".role-legend-title text", "fill: #5B6878"));
    expect(light).toMatch(rule(".role-axis-grid line", "stroke-opacity: 0.08"));
  });

  it("switches them to the dark tokens: graphite text #E6EBF2, slate #98A4B3, a white hairline at 9%", () => {
    expect(dark).toMatch(rule(".role-title-text text", "fill: #E6EBF2"));
    expect(dark).toMatch(rule(".role-axis-label text", "fill: #E6EBF2"));
    expect(dark).toMatch(rule(".role-legend-label text", "fill: #E6EBF2"));
    expect(dark).toMatch(rule(".role-axis-title text", "fill: #98A4B3"));
    expect(dark).toMatch(rule(".role-legend-title text", "fill: #98A4B3"));
    expect(dark).toMatch(rule(".role-axis-grid line", "stroke: #FFFFFF"));
    expect(dark).toMatch(rule(".role-axis-grid line", "stroke-opacity: 0.09"));
  });

  it("switches every series colour to its dark token, bars and lines and legend swatches alike", () => {
    const pairs = [
      ["#E89A0C", "#F5B437"], // saffron
      ["#15845A", "#3CC489"], // fern
      ["#17202B", "#E6EBF2"], // graphite
      ["#5B6878", "#98A4B3"], // slate
      ["#C62F43", "#F0697A"], // crimson
    ];
    for (const [lightColour, darkColour] of pairs) {
      expect(dark).toMatch(rule(`[fill="${lightColour}"]`, `fill: ${darkColour}`));
      expect(dark).toMatch(rule(`[stroke="${lightColour}"]`, `stroke: ${darkColour}`));
    }
  });

  it("draws the pie's seams in the dark paper colour, so slices stay separated on a dark tile", () => {
    expect(dark).toMatch(rule('[stroke="#FFFFFF"]', "stroke: #151C26"));
  });

  it("declares both schemes, so a chart opened on its own gets a dark page in dark mode", () => {
    expect(light).toMatch(/color-scheme:\s*light dark/); // without it the browser paints a white page under light text
  });

  it("puts the style block first inside the SVG, before anything it styles", () => {
    const styled = styleSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><g></g></svg>');
    expect(styled).toBe(`<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><style>${CHART_CSS}</style><g></g></svg>`);
  });
});
