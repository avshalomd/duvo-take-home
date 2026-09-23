// The stored verdict's headline, or null when the run was never judged. The same reading as the runs queries make:
// the verdict column is jsonb, so its shape is checked here rather than trusted.
export function outcomeOf(verdict: unknown): "pass" | "pass_with_notes" | "fail" | "unknown" | null {
  const v = (verdict as { verdict?: unknown } | null)?.verdict;
  return v === "pass" || v === "pass_with_notes" || v === "fail" || v === "unknown" ? v : null;
}
