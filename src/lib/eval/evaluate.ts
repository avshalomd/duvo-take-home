import type { EvaluateRun } from "@/contracts/eval";

// STUB - the eval package: code checks on the files, then decide() on answeredQuery and followedPlan.
export const evaluateRun: EvaluateRun = async (input) => ({
  verdict: input.files.length > 0 ? "pass" : "fail",
  checks: [{ id: "files", label: "A file was written", ok: input.files.length > 0, detail: `${input.files.length} file(s)` }],
  judgment: null,
  review: null,
  reasons: input.files.length > 0 ? [] : ["No file was written"],
  evaluatedAt: new Date().toISOString(),
});
