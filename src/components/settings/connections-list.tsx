"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import type { Connection } from "@/contracts/connection";
import { ConnectionDialog } from "./connection-dialog";
import { ConnectionRow } from "./connection-row";
import { InsetGroup, RowGlyph, rowLine } from "./grouped";

// The connections the agent can use, as one group: a row per connection, "Add a connection" as the last row, and a
// footer that says what the switches do. `canEdit` is false for a member: read-only rows and no Add (the actions
// refuse anyway). One word for office workers, "connection"; "server" only in the add form's Advanced (UX QA U29).
export function ConnectionsList({ connections, canEdit }: { connections: Connection[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);

  return (
    <>
      <InsetGroup
        title="Connections the agent can use"
        data-testid="connections"
        footer={
          canEdit
            ? "A run uses the connections that are switched on. Open a connection to see its tools."
            : "A run uses the connections that are switched on. Only an owner or an admin can change them."
        }
      >
        {connections.length === 0 && (
          <li className="px-4 py-4 text-slate">No connections yet{canEdit ? ". Add one to give the agent more to work with." : "."}</li>
        )}
        {connections.map((c) => (
          <ConnectionRow key={c.id} connection={c} canEdit={canEdit} />
        ))}
        {canEdit && (
          <li className={rowLine("glyph")}>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-muted"
            >
              <RowGlyph className="bg-graphite text-paper">
                <Plus strokeWidth={2.5} />
              </RowGlyph>
              Add a connection
            </button>
          </li>
        )}
      </InsetGroup>
      {canEdit && <ConnectionDialog open={adding} onOpenChange={setAdding} />}
    </>
  );
}
