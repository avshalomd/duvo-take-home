"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setConnectionEnabledAction } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import type { Connection } from "@/contracts/connection";
import { AddConnectionDialog } from "./add-connection-form";
import { connectionStatus } from "./connection-label";
import { StatusDot } from "./status-dot";

// The switches decide which MCP servers the next run is given, so the state shown must be the server's.
export function ConnectionsList({ connections }: { connections: Connection[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-xl border bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">Connections</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" /> Add a server
        </button>
      </div>
      {connections.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">No servers yet - add one to give the agent tools.</p>
      ) : (
        <ul data-testid="connections" className="divide-y">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} />
          ))}
        </ul>
      )}
      <AddConnectionDialog open={adding} onOpenChange={setAdding} />
    </section>
  );
}

function ConnectionRow({ connection }: { connection: Connection }) {
  const [enabled, setEnabled] = useState(connection.enabled);
  const [pending, startTransition] = useTransition();
  const status = connectionStatus(connection.lastStatus);

  function toggle(next: boolean) {
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
    <li className="flex items-center gap-2.5 px-3 py-2">
      <StatusDot tone={status.tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{connection.name}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {host(connection.url)} - {status.label}
        </p>
      </div>
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label={`Enable ${connection.name}`}
        className="shrink-0 data-checked:bg-emerald-600"
      />
    </li>
  );
}

// The host is the identity of a server; the full path is noise in a 21rem column.
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
