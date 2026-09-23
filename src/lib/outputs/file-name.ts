import path from "node:path";

// The contract's pattern (src/contracts/outputs.ts), repeated here so the tool refuses a bad name itself instead of
// relying on the SDK to have validated the arguments first.
const NAME = /^[\w-]{1,60}$/;

/**
 * Where an output tool may write `file`: directly inside the run directory, with exactly the tool's extension.
 * Throws a sentence the agent can act on otherwise; the tool turns it into an error result.
 */
export function outputPath(dir: string, file: string, ext: ".svg" | ".xlsx"): string {
  if (!file.endsWith(ext)) throw new Error(`The file name must end in ${ext}, like chart${ext}; got "${file}".`);
  const stem = file.slice(0, -ext.length);
  if (!NAME.test(stem)) {
    throw new Error(`"${file}" is not a usable file name: use letters, digits, - and _ only (no folders, no spaces).`);
  }
  const root = path.resolve(dir);
  const target = path.resolve(root, file);
  // The pattern above already rules out "/" and "..", so this cannot fire today; it is the second belt should the
  // pattern ever be loosened.
  if (path.dirname(target) !== root) throw new Error(`"${file}" is not a usable file name: it would leave the working directory.`);
  return target;
}
