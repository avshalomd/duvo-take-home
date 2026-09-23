import "server-only";
import type { LanguageModel } from "ai";
import type { AutomationDraft, DraftAutomation } from "@/contracts/automation";
import type { DraftRun } from "./draft.prompt";

type DraftOptions = { model?: () => LanguageModel; fallback?: () => LanguageModel | null };

/** extract(): a finished run generalised into an automation draft the user then edits. */
export const draftAutomation = (async (_run: DraftRun, _options: DraftOptions = {}): Promise<AutomationDraft> => {
  throw new Error("not implemented: draftAutomation"); // STUB: the automations package
}) satisfies DraftAutomation;
