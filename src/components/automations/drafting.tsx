"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { draftFromRunAction } from "@/app/(app)/automations/actions";
import { Button, buttonVariants } from "@/components/ui/button";

// The drafting page's body. The draft is a Server Action started once the page is on screen - not a render side
// effect - so a prefetch or a crawler fetching the URL never spends a model call.
export function Drafting({ runId, prompt }: { runId: string; prompt: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (started.current === attempt) return; // React runs effects twice in development: one draft per attempt, not two
    started.current = attempt;
    draftFromRunAction(runId).then(
      (r) => (r.id ? router.replace(`/automations/${r.id}`) : setError(r.error ?? "The draft could not be made.")),
      () => setError("The draft could not be made. Check your connection and try again."), // the request itself failed
    );
  }, [attempt, runId, router]);

  if (error)
    return (
      <section role="alert" className="space-y-4 rounded-xl border bg-background p-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <h1 className="text-base font-medium">The draft could not be made</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Link href="/automations" className={buttonVariants({ variant: "outline" })}>
            Back to automations
          </Link>
        </div>
      </section>
    );

  return (
    <section aria-live="polite" aria-busy="true" className="space-y-4 rounded-xl border bg-background p-6">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-emerald-700" />
        <h1 className="text-base font-medium">Drafting an automation from this run...</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        It reads what the run was asked, its plan and its files, and writes a first version for you to check and try. This takes
        about half a minute.
      </p>
      <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground italic">{prompt}</blockquote>
    </section>
  );
}
