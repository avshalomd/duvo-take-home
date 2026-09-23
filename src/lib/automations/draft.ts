import "server-only";
import type { DraftAutomation } from "@/contracts/automation";

/** extract(): a finished run generalised into an automation draft the user then edits. */
export const draftAutomation: DraftAutomation = async () => {
  throw new Error("not implemented: draftAutomation"); // STUB: the automations package
};
