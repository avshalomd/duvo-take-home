import type { WorkspaceLimits } from "@/contracts/usage";

export type LimitsFormResult =
  | { ok: true; limits: WorkspaceLimits }
  | { ok: false; fieldErrors: Record<string, string[] | undefined>; values: Record<string, string> };

export function parseLimitsForm(_form: FormData): LimitsFormResult {
  throw new Error("not implemented yet");
}
