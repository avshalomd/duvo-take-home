"use client";

import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";

// Stop, while the run can still change. The form posts to cancelRunAction (the panel owns its state, so a refusal
// - "already finished" - shows in the panel's one error line).
export function StopButton({ runId, action, pending, stopping }: { runId: string; action: (data: FormData) => void; pending: boolean; stopping: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="runId" value={runId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        // once pressed there is nothing more to press: the runner sees the request within two seconds
        disabled={pending || stopping}
        className="h-8 px-3 text-crimson hover:text-crimson max-[899px]:h-10"
      >
        <Square aria-hidden className="size-3 fill-current" />
        Stop
      </Button>
    </form>
  );
}
