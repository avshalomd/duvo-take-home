"use client";

import { Check, X } from "lucide-react";
import { useActionState, useState } from "react";
import { setVerdictAction, type ActionState } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verdictWords } from "@/lib/runs/verdict-words";
import { cn } from "@/lib/utils";
import { FIELD, SMALL } from "./surfaces";

type Props = {
  automationId: string;
  runId: string;
  succeeded: boolean; // "looks right" only fits a run that succeeded
  verdict: "approved" | "rejected" | null;
  note: string | null;
  said: string | null; // the judgment as who made it, worded on the server where the judge's name is known
  changeLabel: string; // "Change", or "Replace Olga Owner's judgment" when the viewer would replace a colleague's
};

// A person's judgment of an example: the automatic check is advice, this is what approval counts. "Looks right" is one
// press; "Not right" asks what is off first. The parent keys this form by the stored verdict and its words, so a saved
// answer re-mounts it in its judged state. Anyone may change it; the new judgment is then theirs.
export function VerdictForm({ automationId, runId, succeeded, verdict, note, said, changeLabel }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setVerdictAction, {});
  const [changing, setChanging] = useState(false);
  const [explaining, setExplaining] = useState(false);

  if (verdict && !changing) {
    const words = said ?? verdictWords(verdict, null, ""); // never "You" without knowing it was you
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]">
        {verdict === "approved" ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-fern">
            <Check aria-hidden className="size-4" /> {words}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium text-crimson">
            <X aria-hidden className="size-4" /> {words}
          </span>
        )}
        {note && <span className="text-slate">({note})</span>}
        <Button type="button" variant="link" size="sm" className="h-auto px-0 text-[15px] text-graphite underline" onClick={() => setChanging(true)}>
          {changeLabel}
        </Button>
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="automationId" value={automationId} />
      <input type="hidden" name="runId" value={runId} />
      {explaining && (
        <div className="space-y-1.5">
          <label htmlFor={`note-${runId}`} className="text-[13px] font-medium tracking-[0.01em] text-slate">
            What is off? (optional)
          </label>
          <Input id={`note-${runId}`} name="note" defaultValue={note ?? ""} className={FIELD} autoFocus />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {explaining ? (
          <>
            {/* the clicked button's name and value arrive in the FormData: this form's one answer is "rejected" */}
            <Button type="submit" name="verdict" value="rejected" variant="outline" disabled={pending} className="h-9 px-4 text-crimson">
              <X aria-hidden /> Mark not right
            </Button>
            <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setExplaining(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" name="verdict" value="approved" variant="outline" disabled={pending || !succeeded} className="h-9 px-4">
              <Check aria-hidden className="text-fern" /> Looks right
            </Button>
            <Button type="button" variant="outline" disabled={pending} className="h-9 px-4" onClick={() => setExplaining(true)}>
              <X aria-hidden className="text-crimson" /> Not right
            </Button>
          </>
        )}
      </div>
      {!succeeded && <p className={SMALL}>This example did not finish well, so it can only be marked not right.</p>}
      {state.error && (
        <p role="alert" className={cn(SMALL, "text-crimson")}>
          {state.error}
        </p>
      )}
    </form>
  );
}
