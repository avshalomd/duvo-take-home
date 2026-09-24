import { ZodError } from "zod";
import { RunLimitError } from "@/lib/runs/limits";

// Why a scheduled slot started no run, as the person reads it beside the schedule (engine review #6). Pure, so the
// words are tested without a database.

/** A slot the tick saw over an hour late (the scheduler was down): skipped rather than run at the wrong hour. */
export const MISSED_SLOT = "Schedules were not being checked at that time.";

/** A refused start in plain words: a limit's own sentence, an instruction rule, never a raw error. */
export function skipReasonOf(e: unknown): string {
  if (e instanceof RunLimitError) return e.message; // the limits already speak to the person
  if (e instanceof ZodError) return `${e.issues[0]?.message ?? "The instructions could not be read"}.`; // "Keep the instructions under 4000 characters"
  return "The run could not be started.";
}
