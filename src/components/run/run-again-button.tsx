"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runAgainAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

// "Run again": the same brief as a new run, which then opens. Labelled, never an icon alone (Q101). It sends the run's
// id only: the server reads the brief, so a follow-up runs its whole thread again, not its last change.
export function RunAgainButton({ runId, prominent }: { runId: string; prominent?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function again() {
    const data = new FormData();
    data.set("runId", runId);
    start(async () => {
      const result = await runAgainAction({}, data);
      if (result.startedId) router.push(`/?run=${result.startedId}`);
      else setError(result.error ?? "The run could not start");
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" onClick={again} disabled={pending} variant={prominent ? "default" : "ghost"} className="h-9 px-4 max-[899px]:h-10">
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RotateCw aria-hidden />}
        Run again
      </Button>
      {error && (
        <span role="alert" className="text-[13px] text-crimson">
          {error}
        </span>
      )}
    </span>
  );
}
