import "server-only";
import type { LanguageModel } from "ai";
import { AutomationDraft, type DraftAutomation } from "@/contracts/automation";
import { extract } from "@/lib/llm/extract";
import { DRAFT_INSTRUCTIONS, draftInput, type DraftRun } from "./draft.prompt";

// Tests hand in a mock model; the app uses extract()'s defaults (getModel, then the fallback model).
type DraftOptions = { model?: () => LanguageModel; fallback?: () => LanguageModel | null };

/**
 * extract(): a finished run generalised into an automation draft the user then edits. One structured call - the
 * model writes the draft, AutomationDraft checks it (the instructions must carry {input}), and a draft that does not
 * fit arrives as an LlmError the page shows with Try again.
 */
export const draftAutomation = (async (run: DraftRun, options: DraftOptions = {}): Promise<AutomationDraft> => {
  const { data } = await extract({
    schema: AutomationDraft,
    instructions: DRAFT_INSTRUCTIONS,
    input: draftInput(run),
    timeoutMs: 60_000, // a whole template is a longer answer than a field or two
    ...options,
  });
  return data;
}) satisfies DraftAutomation;
