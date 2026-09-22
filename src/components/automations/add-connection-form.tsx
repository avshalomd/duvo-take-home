"use client";

import { useActionState, useState } from "react";
import { addConnectionAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Adding a server is the rare path, so it stays folded away behind one line until it is wanted.
export function AddConnectionForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addConnectionAction, {});

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
        + add an MCP server
      </Button>
    );
  }

  return (
    <form data-testid="connections-form" action={action} className="space-y-2 rounded-lg border bg-background p-3">
      <Field name="name" label="Name" placeholder="Linear" defaultValue={state.values?.name} error={state.fieldErrors?.name?.[0]} />
      <Field name="url" label="URL" placeholder="https://mcp.example.com/mcp" defaultValue={state.values?.url} error={state.fieldErrors?.url?.[0]} />
      {/* the token is sent as a Bearer header and stays on the server: the list only ever shows hasToken */}
      <Field name="token" label="Token (optional)" type="password" error={state.fieldErrors?.token?.[0]} />
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding..." : "Add"}
        </Button>
      </div>
    </form>
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
      <Input id={name} name={name} aria-invalid={Boolean(error)} {...input} />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
