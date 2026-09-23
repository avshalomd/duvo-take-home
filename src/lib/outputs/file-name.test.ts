import path from "node:path";
import { describe, expect, it } from "vitest";
import { outputPath } from "./file-name";

const dir = path.join("/tmp", "runs", "abc");

describe("outputPath", () => {
  it("places a plain file name inside the run directory", () => {
    expect(outputPath(dir, "chart.svg", ".svg")).toBe(path.join(dir, "chart.svg"));
    expect(outputPath(dir, "eu-data_2026.xlsx", ".xlsx")).toBe(path.join(dir, "eu-data_2026.xlsx"));
  });

  it("refuses a name that climbs out of the run directory", () => {
    expect(() => outputPath(dir, "../x.svg", ".svg")).toThrow(/file name/);
    expect(() => outputPath(dir, "/etc/x.svg", ".svg")).toThrow(/file name/);
    expect(() => outputPath(dir, "sub/x.svg", ".svg")).toThrow(/file name/);
  });

  it("refuses any other extension, so a chart tool can never write an .exe or a .csv", () => {
    expect(() => outputPath(dir, "x.exe", ".svg")).toThrow(/\.svg/);
    expect(() => outputPath(dir, "x.xlsx", ".svg")).toThrow(/\.svg/);
    expect(() => outputPath(dir, "x.svg", ".xlsx")).toThrow(/\.xlsx/);
  });

  it("refuses a name with no stem or with spaces", () => {
    expect(() => outputPath(dir, ".svg", ".svg")).toThrow(/file name/);
    expect(() => outputPath(dir, "my chart.svg", ".svg")).toThrow(/file name/);
  });
});
