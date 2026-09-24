import { VerdictKind } from "@/contracts/eval";

// The stored verdict's headline, or null when the run was never judged. The same reading as the runs queries make:
// the verdict column is jsonb, so its shape is checked here rather than trusted.
export function outcomeOf(verdict: unknown): VerdictKind | null {
  const parsed = VerdictKind.safeParse((verdict as { verdict?: unknown } | null)?.verdict);
  return parsed.success ? parsed.data : null;
}
