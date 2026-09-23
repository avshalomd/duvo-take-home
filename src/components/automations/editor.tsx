"use client";

import { LoaderCircle } from "lucide-react";
import type { EditState } from "@/app/(app)/automations/actions";
import type { Automation } from "@/contracts/automation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EditValues } from "@/lib/automations/form";
import { cn } from "@/lib/utils";
import { describedBy, Field } from "./field";
import { ListField } from "./list-field";
import { FIELD } from "./surfaces";

type ConnectionChoice = { name: string; enabled: boolean };

/** The automation as the form shows it: lists become one item per row. */
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

const rowsOf = (text: string) => text.split("\n");

// The document in edit mode, in place on the same sheet. The action and its state belong to the parent, which goes
// back to reading once a save succeeds. A refused save returns what was typed and the form renders it again (React
// 19 resets a form after its action); the form's key is where its defaults come from - the saved row's updatedAt and
// the typed values a refused save sent back - so new defaults re-mount it (Base UI warns when a default changes).
export function AutomationEditor({
  automation,
  connections,
  state,
  action,
  pending,
  onCancel,
  approver,
}: {
  automation: Automation;
  connections: ConnectionChoice[];
  state: EditState;
  action: (formData: FormData) => void;
  pending: boolean;
  onCancel: () => void;
  approver: boolean;
}) {
  const v = state.values ?? valuesOf(automation);
  const err = state.fieldErrors ?? {};
  // Q178: once approved, people call it by its command; a member edits the rest and reads the command
  const commandLocked = !approver && automation.status !== "draft";

  // the workspace's connections, plus any the template names that Settings no longer has, so none is dropped silently
  const choices: ConnectionChoice[] = [
    ...connections,
    ...automation.template.connections.filter((n) => !connections.some((c) => c.name === n)).map((name) => ({ name, enabled: false })),
  ];

  return (
    <form key={`${automation.updatedAt}:${JSON.stringify(state.values ?? null)}`} action={action} className="space-y-7" aria-label="Edit the automation">
      <input type="hidden" name="id" value={automation.id} />
      <input type="hidden" name="version" value={automation.version} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Name" error={err.name}>
          <Input {...describedBy("name", err.name)} name="name" defaultValue={v.name} className={FIELD} />
        </Field>
        <Field
          id="command"
          label="Command"
          hint={commandLocked ? "People call it by this command, so an owner or an admin changes it." : "What you type on Home after the slash"}
          error={err.command}
        >
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="text-[17px] text-slate">
              /
            </span>
            {/* read-only, not disabled: it is still sent, so the save sees the command unchanged */}
            <Input
              {...describedBy("command", err.command)}
              name="command"
              defaultValue={commandLocked ? automation.command : v.command}
              readOnly={commandLocked}
              autoCapitalize="none"
              spellCheck={false}
              className={cn(FIELD, commandLocked && "bg-muted text-slate")}
            />
          </div>
        </Field>
      </div>

      <Field id="description" label="What it does" hint="One sentence, shown in the gallery. The result is checked against it." error={err.description}>
        <Input {...describedBy("description", err.description)} name="description" defaultValue={v.description} className={FIELD} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="inputLabel" label="Input" hint="What the input is, e.g. Company name" error={err.inputLabel}>
          <Input {...describedBy("inputLabel", err.inputLabel)} name="inputLabel" defaultValue={v.inputLabel} className={FIELD} />
        </Field>
        <Field id="inputHint" label="Hint" hint="Shown in the input box" error={err.inputHint}>
          <Input {...describedBy("inputHint", err.inputHint)} name="inputHint" defaultValue={v.inputHint} className={FIELD} />
        </Field>
        <Field id="inputExample" label="Example" hint="Offered as the first example" error={err.inputExample}>
          <Input {...describedBy("inputExample", err.inputExample)} name="inputExample" defaultValue={v.inputExample} className={FIELD} />
        </Field>
      </div>

      <Field id="instructions" label="The brief" hint="What the agent is told. Write {input} where the input goes." error={err["template.instructions"]}>
        <Textarea
          {...describedBy("instructions", err["template.instructions"])}
          name="instructions"
          rows={5}
          defaultValue={v.instructions}
          className="rounded-[12px] bg-paper px-3 py-2.5 text-[17px] leading-[1.6]"
        />
      </Field>

      <ListField name="expectedOutputs" label="What it makes" initial={rowsOf(v.expectedOutputs)} addLabel="Add an output" error={err["template.expectedOutputs"]} />

      <Field id="outputFormat" label="The same every time" hint="File names, columns, headings" error={err["template.outputFormat"]}>
        <Textarea {...describedBy("outputFormat", err["template.outputFormat"])} name="outputFormat" rows={2} defaultValue={v.outputFormat} className="rounded-[12px] bg-paper px-3 py-2.5 text-[15px]" />
      </Field>

      <ListField name="steps" label="Steps" initial={rowsOf(v.steps)} addLabel="Add a step" numbered error={err["template.steps"]} />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-[13px] font-medium tracking-[0.01em] text-slate">Needs these connections</legend>
        {choices.length === 0 ? (
          <p className="text-slate">This workspace has no connections. Add them in Settings.</p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {choices.map((c) => (
              <label key={c.name} className="flex items-center gap-2">
                <Checkbox name="connections" value={c.name} defaultChecked={v.connections.includes(c.name)} />
                {c.name}
                {!c.enabled && <span className="text-[13px] text-slate">(off in Settings)</span>}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
        <Button type="submit" disabled={pending} className="h-10 px-5 text-[15px]">
          {pending && <LoaderCircle className="size-4 animate-spin" />}
          Save changes
        </Button>
        <Button type="button" variant="ghost" className="h-10 px-4 text-[15px]" onClick={onCancel}>
          Cancel
        </Button>
        <p aria-live="polite" className={cn("text-[15px]", (state.error || state.fieldErrors) && "text-crimson")}>
          {state.error ?? (state.fieldErrors ? "Some fields need a change, see above." : null)}
        </p>
      </div>
      <p className="text-[13px] tracking-[0.01em] text-slate">
        Changing what the agent is told makes a new version, which needs a new example
        {/* a member's edit of a ready automation takes it out of use until someone who can approve does (Q178) */}
        {approver ? " before it can be used." : " and an owner's or an admin's approval before it can be used."}
      </p>
    </form>
  );
}
