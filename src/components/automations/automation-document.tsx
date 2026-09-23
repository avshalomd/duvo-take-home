"use client";

import { useActionState, useState } from "react";
import { saveAutomationAction, type EditState } from "@/app/(app)/automations/actions";
import type { Automation } from "@/contracts/automation";
import { Button } from "@/components/ui/button";
import { DocumentView } from "./document-view";
import { AutomationEditor } from "./editor";

// The builder's document: read like a page, edited in place on the same sheet. It holds the save's state, so a
// successful save can return to reading and still say "Saved." there.
export function AutomationDocument({
  automation,
  connections,
  footer,
  approver,
}: {
  automation: Automation;
  connections: { name: string; enabled: boolean }[];
  footer?: React.ReactNode;
  approver: boolean; // an owner or an admin (Q178): the editor's note says who approves a new version
}) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveAutomationAction, {});
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(state);
  // a new result from the action (derived during render, React's pattern): a successful save goes back to reading
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setEditing(false);
  }

  if (editing)
    return (
      <AutomationEditor
        automation={automation}
        connections={connections}
        state={state}
        action={action}
        pending={pending}
        onCancel={() => setEditing(false)}
        approver={approver}
      />
    );

  return (
    <div className="space-y-8">
      <DocumentView automation={automation} />
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
        <Button variant="outline" className="h-10 px-5 text-[15px]" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {state.message && (
          <p aria-live="polite" className="text-[15px] text-fern">
            {state.message}
          </p>
        )}
        <span className="ml-auto">{footer}</span>
      </div>
    </div>
  );
}
