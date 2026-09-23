"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { setVerdictAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  automationId: string;
  runId: string;
  succeeded: boolean; // "looks right" only fits a run that succeeded
  verdict: "approved" | "rejected" | null;
  note: string | null;
};

// The person's own judgment of an example. The automatic check is advice; this is what approval counts. The parent
// keys this form by the stored verdict, so a saved answer re-mounts it in its "you said" state.
export function VerdictForm({ automationId, runId, succeeded, verdict, note }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setVerdictAction, {});
  const [changing, setChanging] = useState(false);

  if (verdict && !changing)
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {verdict === "approved" ? (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-4" /> You said it looks right
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
            <X className="size-4" /> You said it is not right
          </span>
        )}
        {note && <span className="text-muted-foreground">- {note}</span>}
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setChanging(true)}>
          Change
        </Button>
      </p>
    );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="automationId" value={automationId} />
      <input type="hidden" name="runId" value={runId} />
      <label htmlFor={`note-${runId}`} className="text-sm font-medium">
        Is this what you wanted?
      </label>
      <Input id={`note-${runId}`} name="note" placeholder="A note, if something is off (optional)" defaultValue={note ?? ""} className="h-8 text-sm" />
      <div className="flex flex-wrap gap-2">
        {/* the clicked button's name and value arrive in the FormData, so one form carries both answers */}
        <Button type="submit" name="verdict" value="approved" size="sm" disabled={pending || !succeeded} variant="outline">
          <Check className="size-3.5" /> Looks right
        </Button>
        <Button type="submit" name="verdict" value="rejected" size="sm" disabled={pending} variant="outline">
          <X className="size-3.5" /> Not right
        </Button>
      </div>
      {!succeeded && <p className="text-xs text-muted-foreground">This example did not finish well, so it can only be marked not right.</p>}
      {state.error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
