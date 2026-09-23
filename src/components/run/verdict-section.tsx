import type { Verdict } from "@/contracts/eval";
import { humanizeTools } from "./format";
import { Empty, Section } from "./section";
import { StatusBadge } from "./status-badge";

// The evaluator's answer in full: the code checks (each one listed, passed or not), what the models judged and,
// when it was escalated, the review's own reasoning. The overview above carries the short version.
export function VerdictSection({
  verdict,
  connections,
  runStatus,
}: {
  verdict: Verdict | null;
  connections: { name: string }[];
  runStatus: string;
}) {
  const finished = runStatus === "succeeded" || runStatus === "failed" || runStatus === "cancelled";
  // the escalation's reasoning is also copied into reasons by the evaluator: show it once, under Review
  const reasons = verdict?.reasons.filter((r) => r !== verdict.review?.reasoning) ?? [];

  return (
    <Section title="Verdict" aside={verdict ? <StatusBadge status={verdict.verdict} /> : undefined}>
      <div data-testid="verdict" className="space-y-3">
        {!verdict ? (
          <Empty>
            {finished ? "This run was not judged." : "Not evaluated yet - the evaluator runs when the agent finishes."}
          </Empty>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {verdict.checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className={c.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                    {c.ok ? "PASS" : "FAIL"}
                  </span>
                  <span>
                    {c.label}
                    <span className="text-muted-foreground"> - {humanizeTools(c.detail, connections)}</span>
                  </span>
                </li>
              ))}
            </ul>

            {verdict.judgment && (
              <p className="text-sm text-muted-foreground">
                Checked by a second model: {pct(verdict.judgment.answeredQuery)} confident it answered the query,{" "}
                {pct(verdict.judgment.followedPlan)} that it followed the plan.
              </p>
            )}

            {/* v2 verdicts say which tiers ran and which one decided; a v1 verdict has neither */}
            {verdict.path && (
              <p className="text-xs text-muted-foreground">
                Tiers run: {verdict.path.join(" -> ")}
                {verdict.decidedBy && `; decided by: ${verdict.decidedBy}`}
              </p>
            )}

            {verdict.review && (
              <div className="rounded-md border-l-2 border-muted-foreground/30 bg-muted/40 p-2 text-sm">
                <p className="font-medium">
                  Review: task {verdict.review.taskFinished ? "finished" : "unfinished"}, response{" "}
                  {verdict.review.responseSuitable ? "suitable" : "not suitable"}
                </p>
                {verdict.review.changeNeeded && (
                  <p className="text-muted-foreground">Change: {verdict.review.changeNeeded}</p>
                )}
                <p className="text-muted-foreground italic">{verdict.review.reasoning}</p>
              </div>
            )}

            {reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {reasons.map((r) => (
                  <li key={r}>{humanizeTools(r, connections)}</li>
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
