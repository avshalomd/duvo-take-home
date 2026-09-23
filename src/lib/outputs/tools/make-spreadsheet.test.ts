import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSpreadsheet } from "./make-spreadsheet";

let root: string; // a parent folder, so a file that escaped the run directory would be visible here
let dir: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "outputs-sheet-"));
  dir = path.join(root, "run");
  await mkdir(dir);
});
afterEach(() => rm(root, { recursive: true, force: true }));

const text = (r: { content: { type: string; text?: string }[] }) => r.content.map((c) => c.text ?? "").join("");
const args = {
  file: "data.xlsx",
  sheets: [
    { name: "Population", columns: ["Country", "Population"], rows: [["Germany", 83400000], ["France", 68400000]] },
    { name: "Sources", columns: ["Source"], rows: [["Eurostat"]] },
  ],
};

describe("make_spreadsheet", () => {
  it("writes the .xlsx into the run directory and tells the agent what it made in one line", async () => {
    const result = await makeSpreadsheet(dir, args);
    expect(result.isError).toBeFalsy();
    expect(text(result)).toBe("Wrote data.xlsx (2 sheets, 3 rows)");
    const bytes = await readFile(path.join(dir, "data.xlsx"));
    expect(bytes.subarray(0, 2).toString()).toBe("PK"); // an .xlsx is a zip archive
  });

  it("answers a path that leaves the run directory with an error result, and writes nothing", async () => {
    const result = await makeSpreadsheet(dir, { ...args, file: "../data.xlsx" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/file name/);
    expect(await readdir(root)).toEqual(["run"]);
  });

  it("answers a name with the wrong extension with an error result", async () => {
    const result = await makeSpreadsheet(dir, { ...args, file: "data.exe" });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/\.xlsx/);
  });
});
