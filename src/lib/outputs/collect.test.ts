import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { collectFiles } from "./collect";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "outputs-collect-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const byName = async () => Object.fromEntries((await collectFiles(dir)).map((f) => [f.name, f]));

describe("collectFiles", () => {
  it("reads the agent's text files as utf8, with their byte count rather than their character count", async () => {
    await writeFile(path.join(dir, "report.md"), "Größe: 1 €");
    await writeFile(path.join(dir, "output.csv"), "a,b\n1,2\n");
    const files = await byName();
    // 10 characters, 14 bytes: ö and ß take two bytes each in utf8, € takes three
    expect(files["report.md"]).toEqual({ name: "report.md", mime: "text/markdown", bytes: 14, content: "Größe: 1 €", encoding: "utf8" });
    expect(files["output.csv"]).toMatchObject({ mime: "text/csv", bytes: 8, encoding: "utf8" });
  });

  it("reads a chart as utf8 text with the SVG type", async () => {
    await writeFile(path.join(dir, "chart.svg"), "<svg></svg>");
    expect((await byName())["chart.svg"]).toMatchObject({ mime: "image/svg+xml", encoding: "utf8", content: "<svg></svg>" });
  });

  it("reads a spreadsheet as base64, because its bytes are not text", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    await writeFile(path.join(dir, "data.xlsx"), bytes);
    expect((await byName())["data.xlsx"]).toEqual({
      name: "data.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: 6,
      content: bytes.toString("base64"),
      encoding: "base64",
    });
  });

  it("ignores every other extension and every folder, so only what we can serve is stored", async () => {
    await writeFile(path.join(dir, "tool.exe"), "MZ");
    await writeFile(path.join(dir, "notes.json"), "{}");
    await mkdir(path.join(dir, "nested.csv")); // a folder named like a file is still a folder
    expect(await collectFiles(dir)).toEqual([]);
  });

  it("returns nothing when the run left no directory at all", async () => {
    expect(await collectFiles(path.join(dir, "missing"))).toEqual([]);
  });
});
