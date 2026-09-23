"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { saveAutomationAction, type EditState } from "@/app/(app)/automations/actions";
import type { Automation } from "@/contracts/automation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EditValues } from "@/lib/automations/form";
import { describedBy, Field } from "./field";

type ConnectionChoice = { name: string; enabled: boolean };

/** The automation as the form shows it: lists become one item per line. */
function valuesOf(a: Automation): EditValues {
  return {
    name: a.name,
    command: a.command,
    description: a.description,
    inputLabel: a.inputLabel,
    inputHint: a.inputHint,
    inputExample: a.inputExample,
    instructions: a.template.instructions,
    expectedOutputs: a.template.expectedOutputs.join("\n"),
    outputFormat: a.template.outputFormat,
    steps: a.template.steps.join("\n"),
    connections: a.template.connections,
  };
}

// The editor. A refused save returns what was typed and the form renders it again (React 19 resets a form after its
// action). The form's key is what its defaults come from - the saved row's updatedAt, and the typed values a refused
// save sent back - so new defaults re-mount it: Base UI's inputs warn when a default changes under them.
export function AutomationEditor({ automation, connections }: { automation: Automation; connections: ConnectionChoice[] }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveAutomationAction, {});
  const v = state.values ?? valuesOf(automation);
  const err = state.fieldErrors ?? {};

  // the workspace's connections, plus any the template names that Settings no longer has, so none is dropped silently
  const choices: ConnectionChoice[] = [
    ...connections,
    ...automation.template.connections.filter((n) => !connections.some((c) => c.name === n)).map((name) => ({ name, enabled: false })),
  ];

  return (
    <form key={`${automation.updatedAt}:${JSON.stringify(state.values ?? null)}`} action={action} className="space-y-5" aria-label="Edit the automation">
      <input type="hidden" name="id" value={automation.id} />
      <input type="hidden" name="version" value={automation.version} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Name" error={err.name}>
          <Input {...describedBy("name", err.name)} name="name" defaultValue={v.name} />
        </Field>
        <Field id="command" label="Command" hint="What you type on Home after the backslash" error={err.command}>
          <div className="flex items-center gap-1">
            <span aria-hidden className="text-muted-foreground">
              \
            </span>
            <Input {...describedBy("command", err.command)} name="command" defaultValue={v.command} autoCapitalize="none" spellCheck={false} />
          </div>
        </Field>
      </div>

      <Field id="description" label="What it does" hint="One sentence. It is shown on the card and the result is checked against it." error={err.description}>
        <Input {...describedBy("description", err.description)} name="description" defaultValue={v.description} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="inputLabel" label="Input" hint="What the input is, e.g. Company name" error={err.inputLabel}>
          <Input {...describedBy("inputLabel", err.inputLabel)} name="inputLabel" defaultValue={v.inputLabel} />
        </Field>
        <Field id="inputHint" label="Hint" hint="Shown in the input box" error={err.inputHint}>
          <Input {...describedBy("inputHint", err.inputHint)} name="inputHint" defaultValue={v.inputHint} />
        </Field>
        <Field id="inputExample" label="Example" hint="Offered as the first example" error={err.inputExample}>
          <Input {...describedBy("inputExample", err.inputExample)} name="inputExample" defaultValue={v.inputExample} />
        </Field>
      </div>

      <Field id="instructions" label="Instructions" hint="What the agent is told. Write {input} where the input goes." error={err["template.instructions"]}>
        <Textarea {...describedBy("instructions", err["template.instructions"])} name="instructions" rows={5} defaultValue={v.instructions} className="text-sm leading-relaxed" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expectedOutputs" label="Produces" hint="One output per line" error={err["template.expectedOutputs"]}>
          <Textarea {...describedBy("expectedOutputs", err["template.expectedOutputs"])} name="expectedOutputs" rows={3} defaultValue={v.expectedOutputs} className="text-sm" />
        </Field>
        <Field id="outputFormat" label="Keep the same every time" hint="File names, columns, headings" error={err["template.outputFormat"]}>
          <Textarea {...describedBy("outputFormat", err["template.outputFormat"])} name="outputFormat" rows={3} defaultValue={v.outputFormat} className="text-sm" />
        </Field>
      </div>

      <Field id="steps" label="Steps" hint="One step per line, in order. The agent plans exactly these." error={err["template.steps"]}>
        <Textarea {...describedBy("steps", err["template.steps"])} name="steps" rows={4} defaultValue={v.steps} className="text-sm" />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Needs these connections</legend>
        {choices.length === 0 ? (
          <p className="text-xs text-muted-foreground">This workspace has no connections. Add them in Settings.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {choices.map((c) => (
              <label key={c.name} className="flex items-center gap-2 text-sm">
                <Checkbox name="connections" value={c.name} defaultChecked={v.connections.includes(c.name)} />
                {c.name}
                {!c.enabled && <span className="text-xs text-muted-foreground">(off in Settings)</span>}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">A run will not start while one of these is off.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {pending ? "Saving..." : "Save changes"}
        </Button>
        <p aria-live="polite" className="text-sm">
          {state.error && <span className="text-red-600 dark:text-red-400">{state.error}</span>}
          {state.fieldErrors && <span className="text-red-600 dark:text-red-400">Some fields need a change, see above.</span>}
          {state.message && <span className="text-emerald-700 dark:text-emerald-400">{state.message}</span>}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Changing what the agent is told makes a new version. A new version needs a new example that you check before it can be used.
      </p>
    </form>
  );
}
