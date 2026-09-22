/** Not implemented yet: the tests in unknown-verdict.test.ts come first. */
import type { Verdict } from "@/contracts/eval";

export function unknownVerdict(err: unknown, at = new Date().toISOString()): Verdict {
  void err;
  return { verdict: "pass", checks: [], judgment: null, review: null, reasons: [], evaluatedAt: at };
}
