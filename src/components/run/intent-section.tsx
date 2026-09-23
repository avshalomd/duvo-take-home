import type { Plan } from "@/contracts/run";
import { Empty, Section } from "./section";

// First in the panel, on purpose: how the agent read the instructions, before any work is judged.
export function IntentSection({ prompt, plan, finished }: { prompt: string; plan: Plan | null; finished: boolean }) {
  return (
    <Section title="Intent">
      <p className="mb-3 rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed text-muted-foreground">
        {prompt}
      </p>
      {plan ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{plan.intent}</p>
          <Field label="Expected outputs" items={plan.expectedOutputs} />
          <Field label="Sources" items={plan.sources} />
        </div>
      ) : (
        <Empty>
          {finished
            ? "The agent never stated how it read the instructions."
            : "The agent has not said how it read the instructions yet."}
        </Empty>
      )}
    </Section>
  );
}

function Field({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      {items.join(", ")}
    </p>
  );
}
