"use client";

import { LoaderCircle } from "lucide-react";
import { type ChangeEvent, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addConnectionAction, updateConnectionAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Connection } from "@/contracts/connection";
import { sameServer } from "@/lib/connections/store-origin";
import { submitKeepingValues } from "./submit-keeping-values";

type AuthType = "none" | "bearer" | "oauth";

// The three ways a server can let the agent in, in the words of someone who is not a developer.
const SIGN_IN: { value: AuthType; label: string; hint: string }[] = [
  { value: "none", label: "No sign-in", hint: "The server is open to anyone, like DeepWiki." },
  { value: "bearer", label: "With a token", hint: "You paste a key the service gave you. It is stored encrypted and never shown again." },
  { value: "oauth", label: "Sign in with the service", hint: "After saving, press Sign in beside the server to connect your account." },
];

/** Add a server, or edit one (`connection` given). One form for both, so the two can never ask different questions. */
export function ConnectionDialog({
  open,
  onOpenChange,
  connection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection?: Connection;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{connection ? `Edit ${connection.name}` : "Add a server"}</DialogTitle>
          <DialogDescription>A server gives the agent tools, such as reading a wiki or a code repository.</DialogDescription>
        </DialogHeader>
        {/* inside the content, so each opening mounts a fresh form: nothing typed last time lingers */}
        <ConnectionForm connection={connection} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ConnectionForm({ connection: current, onDone }: { connection?: Connection; onDone: () => void }) {
  // The form starts from the connection as it was when the dialog opened: a save refreshes the list while the dialog
  // is still fading out, and changing an input's default value after mount is what Base UI warns about.
  const [connection] = useState(current);
  const [state, action, pending] = useActionState(connection ? updateConnectionAction : addConnectionAction, {});
  const [authType, setAuthType] = useState<AuthType>(connection?.authType ?? "none");
  const [url, setUrl] = useState(connection?.url ?? "");
  // Q80: the store drops the saved token and sign-in when the address moves to another server; say so before saving.
  // Only once the typed address parses, so a half-typed one does not flash the warning.
  const moved = Boolean(connection && URL.canParse(url) && !sameServer(connection.url, url));
  const movedNote = !moved
    ? null
    : authType === "bearer" && connection?.hasToken
      ? "This is a different server, so the saved token will not be sent to it. Paste a token for the new server."
      : authType === "oauth" && connection?.signedIn
        ? "This is a different server, so the sign-in does not carry over. Sign in to the new server after saving."
        : null;
  const submitted = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  // the first field that was refused takes the cursor: correcting an error should not need a hunt for it
  useEffect(() => {
    if (state.fieldErrors) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  // the action answers {} when it worked: that is the only signal, so the dialog closes on an empty answer
  useEffect(() => {
    if (!submitted.current || pending) return;
    submitted.current = false;
    if (state.error) toast.error(state.error);
    else if (!state.fieldErrors) {
      toast.success(connection ? "Changes saved" : authType === "oauth" ? "Server added. Press Sign in beside it to connect your account." : "Server added and switched on for the next run");
      onDone();
    }
  }, [state, pending, connection, authType, onDone]);

  return (
    // submitted without React's reset: after a refused submit, the chosen sign-in and a pasted token stay as they were
    <form
      data-testid="connection-form"
      ref={form}
      onSubmit={(e) => {
        submitted.current = true;
        submitKeepingValues(e, action);
      }}
      className="space-y-4"
    >
      {connection && <input type="hidden" name="id" value={connection.id} />}
      <Field name="name" label="Name" placeholder="Linear" defaultValue={connection?.name} error={state.fieldErrors?.name?.[0]} />
      <Field
        name="url"
        label="Address"
        placeholder="https://mcp.example.com/mcp"
        defaultValue={connection?.url}
        onChange={(e) => setUrl(e.currentTarget.value)}
        error={state.fieldErrors?.url?.[0]}
      />
      {movedNote && (
        <p aria-live="polite" className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {movedNote}
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">How it signs in</legend>
        {SIGN_IN.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 has-checked:border-foreground/40 has-checked:bg-muted/50">
            <input
              type="radio"
              name="authType"
              value={o.value}
              checked={authType === o.value}
              onChange={() => setAuthType(o.value)}
              className="mt-0.5 accent-foreground"
              aria-label={o.label}
            />
            <span className="space-y-0.5">
              <span className="block text-sm">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* only a token server posts a token: a value typed and then hidden is not sent at all */}
      {authType === "bearer" && (
        <div className="space-y-2">
          <Field
            name="token"
            label="Token"
            type="password"
            autoComplete="off"
            placeholder={connection?.hasToken && !moved ? "Leave empty to keep the saved token" : "Paste the token here"}
            error={state.fieldErrors?.token?.[0]}
          />
          {connection?.hasToken && !moved && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="clearToken" className="accent-foreground" />
              Remove the saved token
            </label>
          )}
        </div>
      )}

      {/* the transport is a detail most people never need: folded away, with the common choice already made */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Advanced</summary>
        <div className="mt-2 space-y-1">
          <Label htmlFor="transport" className="text-xs">
            Connection type
          </Label>
          <select
            id="transport"
            name="transport"
            defaultValue={connection?.transport ?? "http"}
            className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm text-foreground"
          >
            <option value="http">Streamable HTTP (most servers)</option>
            <option value="sse">Server-sent events (older servers)</option>
          </select>
        </div>
      </details>

      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {connection ? (pending ? "Saving..." : "Save") : pending ? "Adding..." : "Add"}
        </Button>
      </DialogFooter>
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
  autoComplete?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
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
