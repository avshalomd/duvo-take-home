import type { CanApprove, FillTemplate } from "@/contracts/automation";

/** The run's prompt with {input} filled, and the system-prompt lines that keep the agent to the template. */
export const fillTemplate: FillTemplate = (a, input) => ({
  prompt: a.template.instructions.replaceAll("{input}", input), // STUB: the automations package
  systemAddendum: "",
});

/** One approved example of the current version, and no rejected one. */
export const canApprove: CanApprove = () => ({ ok: false, reason: "not implemented" }); // STUB
