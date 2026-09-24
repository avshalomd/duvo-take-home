"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { saveAutomationAction, type EditState } from "@/app/(app)/automations/actions";

type Save = {
  state: EditState; // what the editor and the reading view show: the last save's result, unless a Cancel dropped it
  action: (formData: FormData) => void;
  pending: boolean;
  editing: boolean;
  edit: () => void;
  cancel: () => void;
};

const SaveContext = createContext<Save | null>(null);

/**
 * The document's save, held above the page's two layouts. Saving a changed brief on a Ready automation makes it a
 * draft, and the page then draws the document in the draft's place: a new place in the tree, so state kept inside
 * the document was lost with it, "Saved. This is version 2 now" included. Held here, it survives the move.
 */
export function AutomationSave({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveAutomationAction, {});
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(state);
  const [dropped, setDropped] = useState<EditState | null>(null);
  // a new result from the action (derived during render, React's pattern): a successful save goes back to reading
  if (state !== seen) {
    setSeen(state);
    if (state.ok) setEditing(false);
  }
  const save: Save = {
    // Cancel drops what a refused save sent back, so Edit opens on the saved automation, not on the text left behind
    state: state === dropped ? {} : state,
    action,
    pending,
    editing,
    edit: () => setEditing(true),
    cancel: () => {
      setDropped(state);
      setEditing(false);
    },
  };
  return <SaveContext value={save}>{children}</SaveContext>;
}

export function useAutomationSave(): Save {
  const save = useContext(SaveContext);
  if (!save) throw new Error("AutomationDocument needs an AutomationSave above it");
  return save;
}
