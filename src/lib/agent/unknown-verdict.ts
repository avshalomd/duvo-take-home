import type { Verdict } from "@/contracts/eval";

/**
 * What is stored when the evaluator itself crashed. Storing null read as "no verdict", which the run page showed
 * like a clean pass; "unknown" with the reason makes the run say it was not checked, and Re-evaluate can say why.
 */
export function unknownVerdict(err: unknown, at = new Date().toISOString()): Verdict {
  const message = err instanceof Error ? err.message : String(err);
  return { verdict: "unknown", checks: [], judgment: null, review: null, reasons: [`Not checked: ${message}`], evaluatedAt: at };
}
