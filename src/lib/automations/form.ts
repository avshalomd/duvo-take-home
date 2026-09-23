import { AutomationEdit } from "@/contracts/automation";

// The editor's form as it was typed, so a refused save can render every field again (React 19 resets the form).
export type EditValues = {
  name: string;
  command: string;
  description: string;
  inputLabel: string;
  inputHint: string;
  inputExample: string;
  instructions: string;
  expectedOutputs: string; // one per line
  outputFormat: string;
  steps: string; // one per line
  connections: string[];
};
// values come back either way: a save the store refuses (a command already taken) must keep what was typed too
export type ParsedEdit = { ok: true; edit: AutomationEdit; values: EditValues } | { ok: false; fieldErrors: Record<string, string>; values: EditValues };

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/** The editor's FormData checked against AutomationEdit. Errors are keyed by field ("template.instructions"). */
export function parseEditForm(formData: FormData): ParsedEdit {
  const text = (key: string) => String(formData.get(key) ?? "");
  // a list arrives as one field per row (the editable lists) or as one text with a row per line: both read the same
  const rows = (key: string) => formData.getAll(key).map((v) => String(v).trim()).join("\n");
  const values: EditValues = {
    name: text("name"),
    command: text("command"),
    description: text("description"),
    inputLabel: text("inputLabel"),
    inputHint: text("inputHint"),
    inputExample: text("inputExample"),
    instructions: text("instructions"),
    expectedOutputs: rows("expectedOutputs"),
    outputFormat: text("outputFormat"),
    steps: rows("steps"),
    connections: formData.getAll("connections").map(String),
  };

  const parsed = AutomationEdit.safeParse({
    name: values.name,
    command: values.command.trim().replace(/^[\\/]+/, ""), // people type the prefix they call it with
    description: values.description,
    inputLabel: values.inputLabel,
    inputHint: values.inputHint,
    inputExample: values.inputExample,
    template: {
      instructions: values.instructions,
      intent: values.description.trim(), // one sentence, one field: the card shows it and the judge reads it as the intent
      expectedOutputs: lines(values.expectedOutputs),
      outputFormat: values.outputFormat.trim(),
      steps: lines(values.steps),
      connections: values.connections,
    },
  });
  if (parsed.success) return { ok: true, edit: parsed.data, values };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    // "template.steps.2" belongs to the steps box: a list is one field on screen
    const key = issue.path.slice(0, issue.path[0] === "template" ? 2 : 1).join(".");
    fieldErrors[key] ??= issue.message; // the first message per field is the one to fix first
  }
  return { ok: false, fieldErrors, values };
}
