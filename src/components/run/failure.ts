import { AUTOMATION_CHANGED, AUTOMATION_GONE, EXAMPLE_CHANGED } from "@/lib/agent/automation-check";

// Why a run broke, for the banner on the failed run: one plain sentence when the error is one we recognise, else
// null and the banner says only that the run stopped. Run.error is kept as it came (the SDK's subtype, the provider's
// words, the engine's own sentence), and Details still shows it raw; this only reads it.

// The engine's own reasons are already written for a person: they are passed on as they are.
const OWN = [AUTOMATION_GONE, AUTOMATION_CHANGED, EXAMPLE_CHANGED, "The agent was offered a tool source"];

// Order matters: the run's own limits first, then the AI service's answers, matched on the words providers use.
const KNOWN: [RegExp, string][] = [
  [/^timed out after/i, "It ran out of time before it finished."],
  [/error_max_turns|max(imum)? turns/i, "It used up the number of steps one run may take."],
  [/error_max_budget|budget/i, "It reached the spending limit for one run."],
  [/overloaded|\b529\b/i, "The AI service was too busy to answer."],
  [/rate.?limit|too many requests|\b429\b/i, "The AI service had too many requests at once."],
  [/authentication|x-api-key|api key|\b401\b/i, "The AI service did not accept the app's key."],
  [/credit balance|billing|insufficient.?(credit|funds)/i, "The AI account has run out of credit."],
];

export function failureCause(error: string | null | undefined): string | null {
  const text = error?.trim();
  if (!text) return null;
  if (OWN.some((own) => text.startsWith(own))) return /[.!?]$/.test(text) ? text : `${text}.`;
  return KNOWN.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}
