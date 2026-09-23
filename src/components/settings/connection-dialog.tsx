"use client";

import { ChevronDown, LoaderCircle, TriangleAlert } from "lucide-react";
import { type ChangeEvent, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addConnectionAction, updateConnectionAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { Connection } from "@/contracts/connection";
import { sameServer } from "@/lib/connections/store-origin";
import { InsetGroup, rowLine } from "./grouped";
import { SHEET, SHEET_DESCRIPTION, SHEET_TITLE, SheetActions } from "./sheet";
import { submitKeepingValues } from "./submit-keeping-values";

type AuthType = "none" | "bearer" | "oauth";

// The three ways a server can let the agent in, in the words of someone who is not a developer.
const SIGN_IN: { value: AuthType; label: string; hint: string }[] = [
  { value: "none", label: "No sign-in", hint: "The server is open to anyone, like DeepWiki." },
  { value: "bearer", label: "With a token", hint: "You paste a key the service gave you." },
  { value: "oauth", label: "Sign in with the service", hint: "After saving, press Sign in on the server's row." },
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
      <DialogContent className={SHEET} showCloseButton={false}>
        <div className="space-y-1 px-6 pt-6 pb-5">
          <DialogTitle className={SHEET_TITLE}>{connection ? `Edit ${connection.name}` : "Add a server"}</DialogTitle>
          <DialogDescription className={SHEET_DESCRIPTION}>A server gives the agent tools, such as reading a wiki or a code repository.</DialogDescription>
        </div>
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
  const errors = state.fieldErrors;

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
      toast.success(connection ? "Changes saved" : authType === "oauth" ? "Server added. Press Sign in on its row to connect your account." : "Server added and switched on for the next run");
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
    >
      <div className="space-y-6 px-4">
        {connection && <input type="hidden" name="id" value={connection.id} />}
        <InsetGroup
          surface="mist"
          footer={
            (errors?.name || errors?.url || movedNote) && (
              <div className="space-y-1">
                <FieldError id="name-error" text={errors?.name?.[0]} />
                <FieldError id="url-error" text={errors?.url?.[0]} />
                {movedNote && (
                  <p aria-live="polite" className="flex gap-1.5 text-graphite">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-saffron" aria-hidden />
                    {movedNote}
                  </p>
                )}
              </div>
            )
          }
        >
          <TextRow name="name" label="Name" placeholder="Linear" defaultValue={connection?.name} invalid={Boolean(errors?.name)} />
          <TextRow
            name="url"
            label="Address"
            placeholder="https://mcp.example.com/mcp"
            defaultValue={connection?.url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            invalid={Boolean(errors?.url)}
          />
        </InsetGroup>

        <InsetGroup title="How it signs in" surface="mist">
          {SIGN_IN.map((o) => (
            <li key={o.value} className={rowLine()}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  <span className="block text-[13px] tracking-[0.01em] text-slate">{o.hint}</span>
                </span>
                <input
                  type="radio"
                  name="authType"
                  value={o.value}
                  checked={authType === o.value}
                  onChange={() => setAuthType(o.value)}
                  aria-label={o.label}
                  // a round mark at the end of the row, filled with ink when chosen, as a list's choice is in iOS
                  className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-input bg-paper transition-[border-width,border-color] duration-150 outline-none checked:border-[6px] checked:border-graphite focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </label>
            </li>
          ))}
        </InsetGroup>

        {/* only a token server posts a token: a value typed and then hidden is not sent at all */}
        {authType === "bearer" && (
          <InsetGroup
            surface="mist"
            footer={errors?.token ? <FieldError id="token-error" text={errors.token[0]} /> : "Stored encrypted, and never shown again."}
          >
            <TextRow
              name="token"
              label="Token"
              type="password"
              autoComplete="off"
              placeholder={connection?.hasToken && !moved ? "Leave empty to keep it" : "Paste the token"}
              invalid={Boolean(errors?.token)}
            />
            {connection?.hasToken && !moved && (
              <li className={rowLine()}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <span className="flex-1">Remove the saved token</span>
                  <input type="checkbox" name="clearToken" className="size-4 accent-graphite" />
                </label>
              </li>
            )}
          </InsetGroup>
        )}

        {/* the transport is a detail most people never need: folded away, with the common choice already made */}
        <details className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-1 px-4 text-[13px] text-slate select-none hover:text-graphite">
            Advanced
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2">
            <InsetGroup surface="mist">
              <li className={rowLine()}>
                <label htmlFor="transport" className="flex min-h-[48px] items-center gap-3 px-4">
                  <span className="flex-1">Connection type</span>
                  <select
                    id="transport"
                    name="transport"
                    defaultValue={connection?.transport ?? "http"}
                    className="max-w-[60%] cursor-pointer bg-transparent text-right text-slate outline-none focus-visible:text-graphite"
                  >
                    <option value="http">Streamable HTTP, most servers</option>
                    <option value="sse">Server-sent events, older servers</option>
                  </select>
                </label>
              </li>
            </InsetGroup>
          </div>
        </details>
      </div>

      <SheetActions error={state.error}>
        <Button type="button" size="lg" variant="ghost" onClick={onDone} className="px-4">
          Cancel
        </Button>
        <Button type="submit" size="lg" disabled={pending} className="px-5">
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {connection ? (pending ? "Saving..." : "Save") : pending ? "Adding..." : "Add"}
        </Button>
      </SheetActions>
    </form>
  );
}

/** A form row as in iOS: the label at the start, the field filling the rest, no box of its own. */
function TextRow({
  name,
  label,
  invalid,
  ...input
}: {
  name: string;
  label: string;
  invalid: boolean;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  autoComplete?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    // the focused row turns paper with an inset ring: the field itself has no border to carry the focus
    <li className={`${rowLine()} focus-within:bg-paper focus-within:shadow-[inset_0_0_0_2px_var(--ring)]`}>
      <label className="flex min-h-[48px] items-center gap-3 px-4">
        <span className="w-[72px] shrink-0">{label}</span>
        <input
          id={name}
          name={name}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${name}-error` : undefined}
          className="min-w-0 flex-1 bg-transparent py-3 outline-none placeholder:text-slate/70 aria-invalid:text-crimson"
          {...input}
        />
      </label>
    </li>
  );
}

function FieldError({ id, text }: { id: string; text?: string }) {
  if (!text) return null;
  return (
    <p id={id} role="alert" className="text-crimson">
      {text}
    </p>
  );
}
