import { CornerDownRight, FlaskConical, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import type { Run } from "@/contracts/run";

const linkClass = "underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none rounded-sm";

// The small lines under a run's title that say where it came from and what the person made of it.
export function RunNotes({ run, parentTitle }: { run: Run; parentTitle: string | null }) {
  const notes: React.ReactNode[] = [];

  if (run.parentRunId)
    notes.push(
      <Link key="parent" href={`/?run=${run.parentRunId}`} className={linkClass}>
        <CornerDownRight className="mr-1 inline size-3 align-[-1px]" aria-hidden />
        Follows up {parentTitle ?? "an earlier run"}
      </Link>,
    );

  if (run.purpose === "trial") {
    const text = "Example for an automation being tested";
    notes.push(
      run.automationId ? (
        <Link key="trial" href={`/automations/${run.automationId}`} className={linkClass}>
          <FlaskConical className="mr-1 inline size-3 align-[-1px]" aria-hidden />
          {text}
        </Link>
      ) : (
        <span key="trial">{text}</span>
      ),
    );
  }

  if (run.humanVerdict) {
    const right = run.humanVerdict === "approved";
    notes.push(
      <span key="human">
        {right ? <ThumbsUp className="mr-1 inline size-3 align-[-1px]" aria-hidden /> : <ThumbsDown className="mr-1 inline size-3 align-[-1px]" aria-hidden />}
        You marked this: {right ? "looks right" : "not right"}
        {run.humanNote && <span className="italic"> - &ldquo;{run.humanNote}&rdquo;</span>}
      </span>,
    );
  }

  if (notes.length === 0) return null;
  return <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">{notes}</div>;
}
