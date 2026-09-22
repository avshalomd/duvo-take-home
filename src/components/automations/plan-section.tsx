import type { Plan } from "@/contracts/run";
import { Empty, Section } from "./section";

const mark: Record<string, string> = { done: "[x]", running: "[>]", pending: "[ ]", skipped: "[-]" };

// The agent's own plan, as it updates it: done, the step it is on, what is still ahead.
export function PlanSection({ plan }: { plan: Plan | null }) {
  return (
    <Section title="Plan">
      {plan && plan.steps.length > 0 ? (
        <ol className="space-y-1 text-sm">
          {plan.steps.map((step) => (
            <li key={step.index} className="flex gap-2">
              <span className="font-mono text-xs text-muted-foreground">{mark[step.status] ?? "[ ]"}</span>
              <span className={step.status === "done" ? "text-muted-foreground" : ""}>
                {step.title}
                {step.note && <span className="text-muted-foreground"> - {step.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>No plan recorded for this run.</Empty>
      )}
    </Section>
  );
}
