import { ZodError } from "zod";
import { LlmError } from "@/lib/llm/errors";
import { RunLimitError } from "@/lib/runs/limits";

/** A refusal written for the person using the app ("Turn on DeepWiki in Settings to run \audit"): shown as it is. */
export class AutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationError";
  }
}

const FALLBACK = "Something went wrong on our side - try again";

/**
 * What a failed automations action may say to the browser. Only messages written for a person are passed on - ours,
 * a model failure, a run limit, a validation message; anything else (a Postgres error naming the host) is logged
 * for us and answered with one sentence.
 */
export function readError(e: unknown): string {
  if (e instanceof AutomationError || e instanceof LlmError || e instanceof RunLimitError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? FALLBACK;
  console.error("automations action failed", e);
  return FALLBACK;
}
