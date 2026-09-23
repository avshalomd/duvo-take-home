"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Connection } from "@/contracts/connection";
import { ConnectionDialog } from "./connection-dialog";
import { ConnectionRow } from "./connection-row";

// The servers the agent can use. The switches decide which ones the next run is given.
export function ConnectionsList({ connections }: { connections: Connection[] }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Connections</h2>
          <p className="text-xs text-muted-foreground">Servers that give the agent tools. A run uses the ones switched on.</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus /> Add a server
        </Button>
      </div>
      {connections.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No servers yet. Add one to give the agent more to work with.</p>
      ) : (
        <ul data-testid="connections" className="divide-y">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} />
          ))}
        </ul>
      )}
      <ConnectionDialog open={adding} onOpenChange={setAdding} />
    </section>
  );
}
