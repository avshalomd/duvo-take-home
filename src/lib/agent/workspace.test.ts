import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { removeRunDir } from "./workspace";

describe("removeRunDir", () => {
  it("removes the run's working directory with everything in it, once the files are in the database", async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), "run-dir-test-"));
    const dir = path.join(base, "runs", "abc");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "output.csv"), "a,b\n1,2\n");

    await removeRunDir(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it("stays silent when the directory is already gone: the cleanup must never mask the run's own error", async () => {
    await expect(removeRunDir(path.join(os.tmpdir(), "run-dir-test-does-not-exist"))).resolves.toBeUndefined();
  });
});
