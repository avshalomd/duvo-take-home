import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeChart } from "./make-chart";

let root: string; // a parent folder, so a file that escaped the run directory would be visible here
let dir: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "outputs-chart-"));
  dir = path.join(root, "run");
  await mkdir(dir);
});
afterEach(() => rm(root, { recursive: true, force: true }));

const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
const args = {
  file: "chart.svg",
  title: "EU population",
  kind: "bar",
  data: [
    { country: "Germany", population: 83.4 },
    { country: "France", population: 68.4 },
    { country: "Italy", population: 58.9 },
  ],
  x: "country",
  y: "population",
};

describe("make_chart", () => {
  it("writes the SVG into the run directory and tells the agent what it made in one line", async () => {
    const result = await makeChart(dir, args);
    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("Wrote chart.svg (bar chart, 3 points)");
    expect((await readFile(path.join(dir, "chart.svg"), "utf8")).startsWith("<svg")).toBe(true);
  });

  it("answers a path that leaves the run directory with an error result, and writes nothing", async () => {
    const result = await makeChart(dir, { ...args, file: "../x.svg" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/file name/);
    expect(await readdir(root)).toEqual(["run"]);
    expect(await readdir(dir)).toEqual([]);
  });

  it("answers a name with the wrong extension with an error result", async () => {
    const result = await makeChart(dir, { ...args, file: "x.exe" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/\.svg/);
  });

  it("answers a missing field with an error the agent can act on, instead of throwing", async () => {
    const result = await makeChart(dir, { ...args, y: "pop" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/no field "pop"/);
  });
});
