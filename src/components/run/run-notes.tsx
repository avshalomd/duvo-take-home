import { CornerDownRight, FlaskConical, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import type { Run } from "@/contracts/run";
import { verdictWords } from "@/lib/runs/verdict-words";

const link = "rounded-sm underline-offset-2 hover:text-graphite hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

// The quiet lines under a run's title: where it came from, and what the person made of it. One line each.
export function RunNotes({
  run,
  parentTitle,
  automationName,
  verdictLine,
}: {
  run: Run;
  parentTitle: string | null;
  automationName: string | null;
  verdictLine: string | null; // "You said it looks right", "Mia said it looks right" or "Marked: looks right"
}) {
  const notes: React.ReactNode[] = [];

  if (run.parentRunId)
    notes.push(
      <Link key="parent" href={`/?run=${run.parentRunId}`} className={link}>
        <CornerDownRight aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
        Follows up {parentTitle ?? "an earlier run"}
      </Link>,
    );

  // Q95: it names the automation, and stays true after approval - an example is an example of something
  if (run.purpose === "trial") {
    const text = automationName ? `Example for ${automationName}` : "Example for an automation";
    notes.push(
      run.automationId ? (
        <Link key="trial" href={`/automations/${run.automationId}`} className={link}>
          <FlaskConical aria-hidden className="mr-1.5 inline size-3.5 align-[-2px]" />
          {text}
        </Link>
      ) : (
        <span key="trial">{text}</span>
      ),
    );
  }

  if (run.humanVerdict) {
    const right = run.humanVerdict === "approved";
    const Thumb = right ? ThumbsUp : ThumbsDown;
    notes.push(
      <span key="human">
        <Thumb aria-hidden className={`mr-1.5 inline size-3.5 align-[-2px] ${right ? "text-fern" : "text-crimson"}`} />
        {verdictLine ?? verdictWords(run.humanVerdict, null, "") /* never "You" without knowing it was you */}
        {run.humanNote && <span className="italic"> - &ldquo;{run.humanNote}&rdquo;</span>}
      </span>,
    );
  }

  if (notes.length === 0) return null;
  return <div className="mt-3 flex flex-col gap-1 text-[13px] tracking-[0.01em] text-slate">{notes}</div>;
}
