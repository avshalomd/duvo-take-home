"use client";

import { LoaderCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startRunAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

// "Run again": the same brief as a new run, which then opens. Labelled, never an icon alone (Q101).
export function RunAgainButton({ prompt, prominent }: { prompt: string; prominent?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function again() {
    const data = new FormData();
    data.set("prompt", prompt);
    start(async () => {
      const result = await startRunAction({}, data);
      if (result.startedId) router.push(`/?run=${result.startedId}`);
      else setError(result.error ?? result.fieldErrors?.prompt?.[0] ?? "The run could not start");
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
