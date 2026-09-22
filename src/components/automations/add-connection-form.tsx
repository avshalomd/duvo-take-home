"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { addConnectionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Adding a server is the rare path: it lives in a dialog so the column stays a list of what is connected.
// The Zod messages in the contract are short labels; a form asks for a correction in a sentence, with an example.
const SENTENCE: Record<string, string> = {
  "Name it": "Give the server a name - the agent sees it, for example Linear.",
  "A full http(s) URL": "Enter the server's full URL, for example https://mcp.example.com/mcp.",
  "Letters, digits, space, - and _": "Use letters, digits, spaces, hyphens and underscores in the name.",
};
const sentence = (message?: string) => (message ? (SENTENCE[message] ?? message) : undefined);

export function AddConnectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, action, pending] = useActionState(addConnectionAction, {});
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  // the first field that was refused takes the cursor: correcting an error should not need a hunt for it
  useEffect(() => {
    if (!state.fieldErrors) return;
    form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // the action answers with {} when it worked: that is the only signal, so the dialog closes on an empty answer
  useEffect(() => {
    if (!submitted.current || pending) return;
    submitted.current = false;
    if (state.error) toast.error(state.error);
    else if (!state.fieldErrors) {
      // the store creates a connection enabled, so the toast says what is true: it is already on (Q52)
      toast.success("Server added and switched on for the next run");
      onOpenChange(false);
    }
  }, [state, pending, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a server</DialogTitle>
          <DialogDescription>An MCP server over http. The token is stored on the server and never shown again.</DialogDescription>
        </DialogHeader>
        <form
          data-testid="connections-form"
          ref={form}
          action={action}
          onSubmit={() => {
            submitted.current = true;
          }}
          className="space-y-3"
        >
          <Field name="name" label="Name" placeholder="Linear" defaultValue={state.values?.name} error={sentence(state.fieldErrors?.name?.[0])} />
          <Field name="url" label="URL" placeholder="https://mcp.example.com/mcp" defaultValue={state.values?.url} error={sentence(state.fieldErrors?.url?.[0])} />
          <div className="space-y-1">
            <Label htmlFor="transport" className="text-xs">
              Transport
            </Label>
            {/* two values only, from the contract's Transport enum: a native select is the whole control */}
            <select
              id="transport"
              name="transport"
              defaultValue={state.values?.transport ?? "http"}
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            >
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
          </div>
          <Field
            name="token"
            label="Token (optional)"
            type="password"
            placeholder="pasted once, kept on the server"
            error={state.fieldErrors?.token?.[0]}
          />
          {state.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
          <DialogFooter>
            <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <LoaderCircle className="size-3.5 animate-spin" />}
              {pending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  name,
  label,
  error,
  ...input
}: {
  name: string;
  label: string;
  error?: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs">
        {label}
      </Label>
      <Input id={name} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} {...input} />
      {error && (
        <p id={`${name}-error`} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
