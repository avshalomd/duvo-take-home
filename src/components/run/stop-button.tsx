"use client";

import { Square } from "lucide-react";
import { Button } from "@/components/ui/button";

// Stop, while the run can still change. The form posts to cancelRunAction (the panel owns its state, so the
// refusal - "not available yet", "already finished" - shows in the panel's one error line).
export function StopButton({ runId, action, pending, stopping }: { runId: string; action: (data: FormData) => void; pending: boolean; stopping: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="runId" value={runId} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        // once pressed there is nothing more to press: the runner sees the request within two seconds
        disabled={pending || stopping}
        className="text-red-700 hover:text-red-800 max-[899px]:h-10 dark:text-red-400"
      >
        <Square className="size-3 fill-current" aria-hidden />
        Stop
      </Button>
    </form>
  );
}
