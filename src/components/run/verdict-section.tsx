import type { Verdict } from "@/contracts/eval";
import { humanizeTools } from "./format";
import { Empty, Section } from "./section";
import { StatusBadge } from "./status-badge";

// The evaluator's answer in full: the code checks (each one listed, passed or not), what the models judged and,
// when it was escalated, the review's own reasoning. The overview above carries the short version.
export function VerdictSection({
  verdict,
  storedOutcome,
  connections,
  runStatus,
}: {
  verdict: Verdict | null;
  storedOutcome: string | null; // Run.outcome: the headline even when the full verdict is in an older shape
  connections: { name: string }[];
  runStatus: string;
}) {
  const finished = runStatus === "succeeded" || runStatus === "failed" || runStatus === "cancelled";
  // the escalation's reasoning is also copied into reasons by the evaluator: show it once, under Review
  const reasons = verdict?.reasons.filter((r) => r !== verdict.review?.reasoning) ?? [];
  const badge = verdict?.verdict ?? storedOutcome;

  return (
    <Section title="Verdict" aside={badge ? <StatusBadge status={badge} /> : undefined}>
      <div data-testid="verdict" className="space-y-3">
        {!verdict && storedOutcome ? (
          // Q91: the outcome line, Why? and this section say the same thing about a run the first version checked
          <Empty>
            Checked by an earlier version of the app, which kept the result ({storedOutcome.replace(/_/g, " ")}) but not the reasons. Check the
            result again to see them.
          </Empty>
        ) : !verdict ? (
          <Empty>
            {finished ? "This run was not judged." : "Not evaluated yet - the evaluator runs when the agent finishes."}
          </Empty>
        ) : (
          <>
            <ul className="space-y-1 text-[14px]">
              {verdict.checks.map((c, i) => (
                // not c.id alone: a check that runs once per file ("content") repeats its id
                <li key={`${c.id}-${i}`} className="flex gap-2">
                  <span className={c.ok ? "text-fern" : "text-crimson"}>
                    {c.ok ? "passed" : "failed"}
                  </span>
                  <span>
                    {c.label}
                    <span className="text-slate"> - {humanizeTools(c.detail, connections)}</span>
                  </span>
                </li>
              ))}
            </ul>

            {verdict.judgment && (
              <p className="text-[14px] text-slate">
                Checked by a second model: {pct(verdict.judgment.answeredQuery)} confident it answered the query,{" "}
                {pct(verdict.judgment.followedPlan)} that it followed the plan
                {verdict.judgment.stayedInBounds !== undefined && `, ${pct(verdict.judgment.stayedInBounds)} that it acted only on your instructions`}.
              </p>
            )}

            {/* v2 verdicts say which tiers ran and which one decided; a v1 verdict has neither */}
            {verdict.path && (
              <p className="text-[13px] text-slate">
                Tiers that ran: {verdict.path.join(", then ")}
                {verdict.decidedBy && `; decided by: ${verdict.decidedBy}`}
              </p>
            )}

            {verdict.review && (
              <div className="rounded-[12px] bg-mist p-3 text-[14px]">
                <p className="font-medium">
                  Review: task {verdict.review.taskFinished ? "finished" : "unfinished"}, response{" "}
                  {verdict.review.responseSuitable ? "suitable" : "not suitable"}
                </p>
                {verdict.review.changeNeeded && (
                  <p className="text-slate">Change: {verdict.review.changeNeeded}</p>
                )}
                <p className="text-slate italic">{verdict.review.reasoning}</p>
              </div>
            )}

            {reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-[14px] text-slate">
                {reasons.map((r, i) => (
                  // the list never reorders, and two failed per-file checks can read the same
                  <li key={i}>{humanizeTools(r, connections)}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

// Jev answers with probabilities; showing them as-is is the point, so a borderline call is visible.
function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
