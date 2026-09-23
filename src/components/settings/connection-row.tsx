"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setConnectionEnabledAction } from "@/app/(app)/settings/actions";
import { StatusDot } from "@/components/run/status-dot";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Connection } from "@/contracts/connection";
import { cn } from "@/lib/utils";
import { ConnectionDialog } from "./connection-dialog";
import { connectionState, toolCount, toolWords } from "./connection-label";
import { DeleteConnectionDialog } from "./delete-connection-dialog";

// One server: its name, where it lives, how it is doing in plain words, its tools folded away, and what you can do.
// A member (canEdit false) sees the same row with the switch read-only and no Sign in, Edit or Delete.
export function ConnectionRow({ connection, canEdit }: { connection: Connection; canEdit: boolean }) {
  const [enabled, setEnabled] = useState(connection.enabled);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const status = connectionState(connection);
  const tools = connection.tools ?? [];

  function toggle(next: boolean) {
    if (pending) return; // a second press while the first is in flight is ignored, rather than disabling the switch (Q69)
    setEnabled(next); // optimistic: the switch must feel instant
    startTransition(async () => {
      const result = await setConnectionEnabledAction(connection.id, next);
      if (result.error) {
        setEnabled(!next); // the store refused: put the switch back rather than lie about what the run will get
        toast.error(result.error);
      } else {
        toast.success(`${connection.name} ${next ? "on" : "off"} for the next run`);
      }
    });
  }

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <StatusDot tone={status.tone} className="mt-1.5" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium">{connection.name}</p>
        {/* wraps rather than truncates: on a phone the status is the part that must stay readable */}
        <p className="text-xs [overflow-wrap:anywhere] text-muted-foreground">
          {host(connection.url)} · {status.label}
        </p>
        {tools.length > 0 ? (
          <details className="text-xs text-muted-foreground">
            <summary className="w-fit cursor-pointer select-none hover:text-foreground">{toolCount(tools.length)}</summary>
            <ul className="mt-1 flex flex-wrap gap-1">
              {tools.map((t) => (
                <li key={t} className="rounded-md bg-muted px-1.5 py-0.5">
                  {toolWords(t)}
                </li>
              ))}
            </ul>
          </details>
        ) : (
          <p className="text-xs text-muted-foreground">{toolCount(0)}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {connection.authType === "oauth" &&
          (connection.signedIn ? (
            <span className="flex items-center gap-1 px-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Check className="size-3.5" /> Signed in
            </span>
          ) : (
            canEdit && (
              // a plain link, not a client navigation: the route answers with a redirect to the service's own sign-in page
              <a href={`/api/connections/oauth/start?id=${encodeURIComponent(connection.id)}`} className={cn(buttonVariants({ size: "sm" }))}>
                Sign in
              </a>
            )
          ))}
        <Switch
          checked={enabled}
          // never disabled while saving: a disabled control loses focus, and the next press goes nowhere (Q69).
          aria-busy={pending}
          readOnly={!canEdit} // a member still sees on or off, and can focus it, but cannot change it
          onCheckedChange={toggle}
          aria-label={`Use ${connection.name} in runs`}
          // the pseudo-element gives the 18 px switch a 44 px hit area on a phone (Q75)
          className="relative mx-2 shrink-0 data-checked:bg-emerald-700 before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
        />
        {canEdit && (
          <>
            {/* icon-only on a phone, so the name keeps the room; the hidden word still names the button for a screen reader */}
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil /> <span className="sr-only sm:not-sr-only">Edit</span>
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(true)} className="text-muted-foreground hover:text-destructive">
              <Trash2 /> <span className="sr-only sm:not-sr-only">Delete</span>
            </Button>
          </>
        )}
      </div>

      {canEdit && (
        <>
          <ConnectionDialog open={editing} onOpenChange={setEditing} connection={connection} />
          <DeleteConnectionDialog open={deleting} onOpenChange={setDeleting} connection={connection} />
        </>
      )}
    </li>
  );
}

// The host is the identity of a server; the full path is noise in a list.
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
