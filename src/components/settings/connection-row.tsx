"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { setConnectionEnabledAction } from "@/app/(app)/settings/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Connection } from "@/contracts/connection";
import { cn } from "@/lib/utils";
import { ConnectionDialog } from "./connection-dialog";
import { asSentence, connectionState, signInWords, toolCount, toolWords } from "./connection-label";
import { DeleteConnectionDialog } from "./delete-connection-dialog";
import { rowLine } from "./grouped";
import { StatusGlyph } from "./status-glyph";

/**
 * One server as a row: its status glyph, its name and one line under it, and the switch that decides whether the next
 * run gets it. The name opens a second level with the tools the last run saw, the address, how it signs in, and Edit
 * and Delete. A member (canEdit false) sees the same row with the switch read-only and no actions.
 */
export function ConnectionRow({ connection, canEdit }: { connection: Connection; canEdit: boolean }) {
  // the server's value, shown ahead of it while a press is saved: once the save ends it follows the server again, so
  // a connection someone else turned off reads off after the page refreshes, and a refused press falls back by itself
  const [enabled, setEnabled] = useOptimistic(connection.enabled);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const levelId = useId();
  const status = connectionState(connection);
  const needsSomething = status.tone === "warn" || status.tone === "bad";
  const tools = connection.tools ?? [];

  function toggle(next: boolean) {
    if (pending) return; // a second press while the first is in flight is ignored, rather than disabling the switch (Q69)
    startTransition(async () => {
      setEnabled(next); // optimistic: the switch must feel instant
      const result = await setConnectionEnabledAction(connection.id, next);
      if (result.error) {
        toast.error(result.error); // the store refused: the switch goes back to the server's value as the press ends
      } else {
        toast.success(`${connection.name} ${next ? "on" : "off"} for the next run`);
      }
    });
  }

  return (
    <li className={rowLine("glyph")}>
      <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
        <StatusGlyph tone={status.tone} label={asSentence(status.label)} />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={levelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{connection.name}</span>
            {/* one line: what it needs, when it needs something; otherwise where it lives */}
            <span className={cn("block text-[13px] tracking-[0.01em]", status.tone === "bad" ? "text-crimson" : "text-slate", !needsSomething && "truncate")}>
              {needsSomething ? asSentence(status.label) : host(connection.url)}
            </span>
          </span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-slate" aria-hidden>
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
        {canEdit && connection.authType === "oauth" && !connection.signedIn && (
          // a plain link, not a client navigation: the route answers with a redirect to the service's own sign-in page
          <a href={`/api/connections/oauth/start?id=${encodeURIComponent(connection.id)}`} className={cn(buttonVariants({ size: "sm" }), "px-3.5")}>
            Sign in
          </a>
        )}
        <Switch
          checked={enabled}
          // never disabled while saving: a disabled control loses focus, and the next press goes nowhere (Q69).
          aria-busy={pending}
          readOnly={!canEdit} // a member still sees on or off, and can focus it, but cannot change it
          onCheckedChange={toggle}
          aria-label={`Use ${connection.name} in runs`}
          // the pseudo-element gives the 18 px switch a 44 px hit area on a phone (Q75)
          className="relative shrink-0 data-checked:bg-fern before:absolute before:-inset-x-2 before:-inset-y-3 before:content-['']"
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={levelId}
            // it answers a press, so it may move: in from just above, opacity and transform only (docs/DESIGN-V2.md)
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            className="space-y-3 pr-4 pb-4 pl-[58px]"
          >
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium">{asSentence(toolCount(tools.length))}</p>
              {tools.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Tools">
                  {tools.map((t) => (
                    <li key={t} className="rounded-full bg-muted px-2.5 py-0.5 text-[13px]">
                      {toolWords(t)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-0.5 text-[13px] tracking-[0.01em] text-slate">
              <p className="break-all">{connection.url}</p>
              <p>{signInWords(connection)}</p>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDeleting(true)} className="text-crimson hover:bg-crimson-wash hover:text-crimson">
                  Delete
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {canEdit && (
        <>
          <ConnectionDialog open={editing} onOpenChange={setEditing} connection={connection} />
          <DeleteConnectionDialog open={deleting} onOpenChange={setDeleting} connection={connection} />
        </>
      )}
    </li>
  );
}

// The host is the identity of a server; the full address is on the second level.
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
