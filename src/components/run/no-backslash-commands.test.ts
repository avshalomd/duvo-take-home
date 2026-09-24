import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// His call (2026-09-23): commands are "/audit Apple Inc." - a front slash, as in coding agents; the backslash was a
// slip. This reads the Home's own source files and fails on anything that would show a person a backslash command
// (a placeholder, a hint, an error message, a tag) or would parse one.
const ROOT = join(__dirname, "..", "..", "..");
const sourcesIn = (dir: string) =>
  readdirSync(join(ROOT, dir))
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `${dir}/${f}`);
const FILES = [
  ...sourcesIn("src/components/run"),
  ...sourcesIn("src/components/shell"),
  "src/app/(app)/actions.ts",
  "src/app/(app)/(home)/page.tsx",
  "src/app/(app)/readable.ts",
];

// In source, a backslash a person sees is written as two ("\\audit", `\\${command}`, "type \\ to"), and in JSX text
// as one before an expression (">\{command}"). Comments are skipped: they may quote the old form.
const SHOWS_A_BACKSLASH = [/\\\\/, /\\\{/];

function offenders(file: string): string[] {
  return readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(({ line }) => SHOWS_A_BACKSLASH.some((p) => p.test(line)))
    .map(({ line, n }) => `${file}:${n}: ${line.trim()}`);
}

describe("commands use a front slash only", () => {
  it("no string or text in the Home's files shows or parses a backslash command", () => {
    expect(FILES.flatMap(offenders)).toEqual([]);
  });
});
