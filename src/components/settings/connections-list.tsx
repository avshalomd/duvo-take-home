"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { Connection } from "@/contracts/connection";
import { ConnectionDialog } from "./connection-dialog";
import { ConnectionRow } from "./connection-row";
import { InsetGroup, RowGlyph, rowLine } from "./grouped";

// The servers the agent can use, as one group: a row per server, "Add a server" as the last row, and a footer that
// says what the switches do. `canEdit` is false for a member: read-only rows and no Add (the actions refuse anyway).
export function ConnectionsList({ connections, canEdit }: { connections: Connection[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <InsetGroup
        title="Servers the agent can use"
        data-testid="connections"
        footer={
          canEdit
            ? "A run uses the servers that are switched on. Open a server to see its tools."
            : "A run uses the servers that are switched on. Only an owner or an admin can change them."
        }
      >
        {connections.length === 0 && (
          <li className="px-4 py-4 text-slate">No servers yet{canEdit ? ". Add one to give the agent more to work with." : "."}</li>
        )}
        {connections.map((c) => (
          <ConnectionRow key={c.id} connection={c} canEdit={canEdit} />
        ))}
        {canEdit && (
          <li className={rowLine("glyph")}>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 active:bg-muted"
            >
              <RowGlyph className="bg-graphite text-paper">
                <Plus strokeWidth={2.5} />
              </RowGlyph>
              Add a server
            </button>
          </li>
        )}
      </InsetGroup>
      {canEdit && <ConnectionDialog open={adding} onOpenChange={setAdding} />}
    </>
  );
}
