import type { Plan } from "@/contracts/run";
import { Empty, Section } from "./section";

// First in the panel, on purpose: how the agent read the instructions, before any work is judged.
export function IntentSection({ prompt, plan, finished }: { prompt: string; plan: Plan | null; finished: boolean }) {
  return (
    <Section title="Intent">
      <p className="mb-3 rounded-[12px] bg-mist p-3 font-mono text-[12px] leading-relaxed text-slate">
        {prompt}
      </p>
      {plan ? (
        <div className="space-y-1.5 text-[14px]">
          <p className="font-medium">{plan.intent}</p>
          <Field label="Expected outputs" items={plan.expectedOutputs} />
          <Field label="Sources" items={plan.sources} />
        </div>
      ) : (
        <Empty>
          {finished
            ? "The agent never wrote down how it read the brief."
            : "The agent has not said how it read the brief yet."}
        </Empty>
      )}
    </Section>
  );
}

function Field({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <p className="text-[14px]">
      <span className="text-slate">{label}: </span>
      {items.join(", ")}
    </p>
  );
}
