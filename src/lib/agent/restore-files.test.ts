import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restoreFiles } from "./restore-files";

let root: string;
let dir: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "restore-"));
  dir = path.join(root, "run");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("restoreFiles", () => {
  it("writes a text file back byte for byte", async () => {
    await restoreFiles(dir, [{ name: "news.csv", content: "title,url\nA,https://a.example\n", encoding: "utf8" }]);
    expect(await readFile(path.join(dir, "news.csv"), "utf8")).toBe("title,url\nA,https://a.example\n");
  });

  it("decodes a base64 file (an .xlsx) back to its bytes", async () => {
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
    await restoreFiles(dir, [{ name: "sheet.xlsx", content: bytes.toString("base64"), encoding: "base64" }]);
    expect(Buffer.compare(await readFile(path.join(dir, "sheet.xlsx")), bytes)).toBe(0);
  });

  it("creates the working directory if it is not there yet", async () => {
    await restoreFiles(dir, [{ name: "report.md", content: "# Report", encoding: "utf8" }]);
    expect(await readdir(dir)).toEqual(["report.md"]);
  });

  it("never writes outside the working directory, whatever the stored name says", async () => {
    await restoreFiles(dir, [{ name: "../escape.md", content: "no", encoding: "utf8" }]);
    expect(await readdir(dir)).toEqual(["escape.md"]);
    expect(await readdir(root)).toEqual(["run"]);
  });

  it("answers the names and sizes it wrote, for the follow-up's prompt", async () => {
    const written = await restoreFiles(dir, [
      { name: "a.md", content: "hello", encoding: "utf8" },
      { name: "b.xlsx", content: Buffer.from([1, 2, 3]).toString("base64"), encoding: "base64" },
    ]);
    expect(written).toEqual([
      { name: "a.md", bytes: 5 },
      { name: "b.xlsx", bytes: 3 },
    ]);
  });
});
