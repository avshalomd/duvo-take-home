"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setConnectionEnabledAction } from "@/app/actions";
import { Switch } from "@/components/ui/switch";
import type { Connection } from "@/contracts/connection";

// The switches decide which MCP servers the next run is given, so the state shown must be the server's.
export function ConnectionsList({ connections }: { connections: Connection[] }) {
  return (
    <ul data-testid="connections" className="divide-y rounded-lg border bg-background">
      {connections.map((c) => (
        <ConnectionRow key={c.id} connection={c} />
      ))}
    </ul>
  );
}

function ConnectionRow({ connection }: { connection: Connection }) {
  const [enabled, setEnabled] = useState(connection.enabled);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next); // optimistic: the switch must feel instant
    startTransition(async () => {
      const result = await setConnectionEnabledAction(connection.id, next);
      if (result.error) {
        setEnabled(!next); // the store refused: put the switch back rather than lie about what the run will get
        toast.error(result.error);
      }
    });
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={toggle}
        aria-label={`Enable ${connection.name}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{connection.name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{connection.url}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{connection.lastStatus ?? "never used"}</span>
    </li>
  );
}
