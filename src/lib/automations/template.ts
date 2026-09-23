import type { AutomationTemplate, CanApprove, FillTemplate, Trial } from "@/contracts/automation";

const fill = (text: string, input: string) => text.replaceAll("{input}", input);

/**
 * The run's prompt with {input} filled, and the system-prompt lines that keep the agent to the template. The steps
 * go in as a plan to follow, not a suggestion, so every run of an automation has the same shape and the evaluator
 * can hold it to the template.
 */
export const fillTemplate: FillTemplate = (a, rawInput) => {
  const input = rawInput.trim();
  const t = a.template;
  const lines = [
    `This run follows the saved automation "${a.name}". Its input (${a.inputLabel}) is: ${input}`,
    "Plan these steps, in this order, with these titles:",
    ...t.steps.map((s, i) => `${i + 1}. ${fill(s, input)}`),
    `Produce: ${t.expectedOutputs.map((o) => fill(o, input)).join("; ")}`,
    ...(t.outputFormat ? [`Keep to this format: ${t.outputFormat}`] : []),
    "If the input makes a step impossible, mark it skipped and say why.",
  ];
  return { prompt: fill(t.instructions, input), systemAddendum: lines.join("\n") };
};

const finished = (t: Trial) => t.status === "succeeded" || t.status === "failed" || t.status === "cancelled";

/**
 * His rule: nothing a user wrote reaches the agent until a person has seen it work. So approval needs one example of
 * THIS version marked "looks right", and none of this version marked "not right" - a rejection is not outvoted.
 */
export const canApprove: CanApprove = (trials, version) => {
  const current = trials.filter((t) => t.version === version); // an edit bumps the version, so older examples drop out here
  if (current.some((t) => t.humanVerdict === "rejected"))
    return { ok: false, reason: "An example of this version is marked not right. Change the automation, then run a new example." };
  if (current.some((t) => t.humanVerdict === "approved")) return { ok: true };
  if (current.length === 0)
    return {
      ok: false,
      reason: trials.length ? "The examples are from an earlier version. Run an example of this version." : "Run an example first.",
    };
  if (!current.some(finished)) return { ok: false, reason: "Wait for the example to finish, then say whether it looks right." };
  return { ok: false, reason: "Check the example's result and mark it as looks right." };
};

type WhatTheAgentSees = { name: string; inputLabel: string; template: AutomationTemplate };

/**
 * Whether an edit changes what the agent is told or held to: the template (the prompt, and what the evaluator
 * checks against), and the name and input label, which fillTemplate writes into the system addendum. Only such an
 * edit needs a new approved example; the hint, the example input and the command never reach the agent.
 */
export function changesThePrompt(before: WhatTheAgentSees, after: WhatTheAgentSees): boolean {
  const seen = (a: WhatTheAgentSees) =>
    JSON.stringify([a.name, a.inputLabel, a.template.instructions, a.template.intent, a.template.expectedOutputs, a.template.outputFormat, a.template.steps, a.template.connections]);
  return seen(before) !== seen(after);
}
