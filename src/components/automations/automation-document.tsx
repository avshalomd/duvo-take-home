"use client";

import type { Automation } from "@/contracts/automation";
import { Button } from "@/components/ui/button";
import { useAutomationSave } from "./automation-save";
import { DocumentView } from "./document-view";
import { AutomationEditor } from "./editor";

// The builder's document: read like a page, edited in place on the same sheet. The save's state is held above it
// (AutomationSave), so a successful save returns to reading and still says "Saved." there, even when the save made
// a Ready automation a draft and the page drew the document in another place.
export function AutomationDocument({
  automation,
  connections,
  footer,
  approver,
  commandLocked,
}: {
  automation: Automation;
  connections: { name: string; enabled: boolean }[];
  footer?: React.ReactNode;
  approver: boolean; // an owner or an admin (Q178): the editor's note says who approves a new version
  commandLocked: boolean; // the command is read, not edited: approved before, and the viewer is a member
}) {
  const { state, action, pending, editing, edit, cancel } = useAutomationSave();

  if (editing)
    return (
      <AutomationEditor
        automation={automation}
        connections={connections}
        state={state}
        action={action}
        pending={pending}
        onCancel={cancel}
        approver={approver}
        commandLocked={commandLocked}
      />
    );

  return (
    <div className="space-y-8">
      <DocumentView automation={automation} />
      <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
        <Button variant="outline" className="h-10 px-5 text-[15px]" onClick={edit}>
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
