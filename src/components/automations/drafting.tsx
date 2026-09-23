"use client";

import { TriangleAlert } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { draftFromRunAction } from "@/app/(app)/automations/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINK, SHEET } from "./surfaces";

// The drafting page's body. The draft is a Server Action started once the page is on screen - not a render side
// effect - so a prefetch or a crawler fetching the URL never spends a model call. A reload lands on the same draft:
// the server reuses a draft of this run made moments ago (Q119).
export function Drafting({ runId, prompt }: { runId: string; prompt: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
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
      <section role="alert" className={cn(SHEET, "space-y-5 p-6 sm:p-10")}>
        <TriangleAlert aria-hidden className="size-6 text-crimson" />
        <div className="space-y-2">
          <h1 className="page-title text-graphite">The draft could not be made</h1>
          <p className="text-slate">{error}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            className="h-10 px-5 text-[15px]"
            onClick={() => {
              setError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Link href="/automations" className={LINK}>
            Back to automations
          </Link>
        </div>
      </section>
    );

  return (
    <section aria-live="polite" aria-busy="true" className={cn(SHEET, "space-y-5 p-6 sm:p-10")}>
      <span className="relative flex size-5 items-center justify-center rounded-full border-2 border-saffron">
        {/* the thread's bead: work is happening, calmly. Under reduced motion it stops breathing: only the transition
            changes, so the server's HTML and a reduced-motion browser's first render stay the same */}
        <motion.span
          className="absolute inset-[3px] rounded-full bg-saffron"
          animate={{ opacity: [1, 0.45, 1], scale: [1, 0.8, 1] }}
          transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      <div className="space-y-2">
        <h1 className="page-title text-graphite">Writing a first draft</h1>
        <p className="text-slate">It reads what the run was asked, its plan and its files. This takes about half a minute.</p>
      </div>
      <blockquote className="max-w-[66ch] border-l-2 border-hairline pl-4 text-[15px] leading-6 text-graphite/80">{prompt}</blockquote>
    </section>
  );
}
