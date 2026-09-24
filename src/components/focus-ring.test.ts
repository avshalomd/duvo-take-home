import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Q71 gave the app one focus ring. Review (frontend): rows that remove the browser's outline and show focus only as a
// faint tint (an automation's runs, the "New from a run" picker, Invite someone) were all but invisible to the
// keyboard, on paper most of all. This reads the components' source: a class list that drops the outline and tints
// on focus must draw the ring too.
const ROOT = join(__dirname);

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [path] : [];
  });
}

const TINT_ONLY = (line: string) => line.includes("outline-none") && line.includes("focus-visible:bg-") && !line.includes("focus-visible:ring");

describe("keyboard focus on rows", () => {
  it("is never shown by a faint tint alone: each row that tints on focus also draws the focus ring", () => {
    const offenders = sources(ROOT).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => TINT_ONLY(line))
        .map(({ n }) => `${relative(ROOT, file)}:${n}`),
    );
    expect(offenders).toEqual([]);
  });
});
