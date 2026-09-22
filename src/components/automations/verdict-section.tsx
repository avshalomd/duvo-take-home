import type { Verdict } from "@/contracts/eval";
import { Empty, Section } from "./section";
import { StatusBadge } from "./status-badge";

// The evaluator's answer: the code checks first (each one listed, passed or not), then what the models judged.
export function VerdictSection({ verdict }: { verdict: Verdict | null }) {
  return (
    <Section title="Verdict" aside={verdict ? <StatusBadge status={verdict.verdict} /> : undefined}>
      <div data-testid="verdict" className="space-y-3">
        {!verdict ? (
          <Empty>Not evaluated - the evaluator runs when the agent finishes.</Empty>
        ) : (
          <>
            <ul className="space-y-1 text-sm">
              {verdict.checks.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className={c.ok ? "text-emerald-700" : "text-red-600"}>{c.ok ? "PASS" : "FAIL"}</span>
                  <span>
                    {c.label}
                    <span className="text-muted-foreground"> - {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            {verdict.judgment && (
              <p className="text-sm text-muted-foreground">
                Judged: answered the query {pct(verdict.judgment.answeredQuery)}, followed the plan{" "}
                {pct(verdict.judgment.followedPlan)}
              </p>
            )}

            {verdict.review && (
              <div className="rounded-md border bg-muted/40 p-2 text-sm">
                <p className="font-medium">
                  Review: task {verdict.review.taskFinished ? "finished" : "unfinished"}, response{" "}
                  {verdict.review.responseSuitable ? "suitable" : "not suitable"}
                </p>
                {verdict.review.changeNeeded && <p className="text-muted-foreground">Change: {verdict.review.changeNeeded}</p>}
                <p className="text-muted-foreground">{verdict.review.reasoning}</p>
              </div>
            )}

            {verdict.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {verdict.reasons.map((r) => (
                  <li key={r}>{r}</li>
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
