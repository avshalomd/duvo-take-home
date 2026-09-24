import type { Plan, RunState } from "@/contracts/run";
import { stoppedLine, type Heal } from "./heal";

// The run's plan as the thread draws it (src/components/thread/thread.tsx). The thread knows nothing about runs, so
// this is where a step's check becomes a flag, a finished run's last "running" step stops being worked on, a new
// run shows its first bead before the plan exists, and auto-heal's attempts carry the thread on past the plan.

export type PlanThreadStep = {
  key: number | string;
  title: string;
  status: "pending" | "running" | "done" | "skipped" | "unmarked";
  note?: string;
  flag?: string;
};

// Below this, the per-step check thinks the step did not do what its title says (a probability from the checker).
const OFF_TRACK = 0.5;

// Q138: the agent's first seconds go into reading the brief and writing the plan; the thread shows that as its
// first step, so a new run opens on work under way instead of a line of text.
const READING: PlanThreadStep = { key: "reading", title: "Reading your brief", status: "running" };

export function threadSteps(plan: Plan | null, runStatus: string, stepChecks: RunState["stepChecks"], heals: Heal[] = []): PlanThreadStep[] {
  const live = runStatus === "queued" || runStatus === "running" || runStatus === "evaluating";
  const stoppedMidway = runStatus === "cancelled" || runStatus === "failed";
  if (!plan) return live && heals.length === 0 ? [READING] : [];

  const steps = plan.steps.map((step): PlanThreadStep => {
    const out: PlanThreadStep = { key: step.index, title: step.title, status: step.status };
    if (step.note) out.note = step.note;

    // A run that ended cannot still be working: its bead would breathe for ever. A stopped or broken run says
    // where it stopped; a finished one simply never ticked the step, which is "not marked", never "not started"
    // (qa-ai F8; the engine marks such steps itself now, this covers the runs from before it did).
    if (step.status === "running" && stoppedMidway) {
      out.status = "pending";
      out.note = ["Stopped here", step.note].filter(Boolean).join(". ");
    } else if ((step.status === "running" || step.status === "pending") && runStatus === "succeeded") {
      out.status = "unmarked";
    }

    const check = stepChecks?.find((c) => c.stepIndex === step.index);
    // the checker has no reason of its own to add: its note repeats the step's note, which the thread already shows
    if (step.status === "done" && check && check.onTrack < OFF_TRACK) out.flag = "This step may not have done what it says.";
    return out;
  });

  // Auto-heal: each attempt to fix the result is one more step on the same thread. Only the latest can be under way;
  // what the check found is under Why?, not here, because the run has not said pass or fail yet (his call).
  const fixes = heals.map((heal, i): PlanThreadStep => {
    const title = `Fix what the check found (attempt ${heal.attempt} of ${heal.max})`;
    const key = `heal-${heal.attempt}`;
    if (heal.stopped) return { key, title, status: "skipped", note: stoppedLine(heal) };
    if (i < heals.length - 1) return { key, title, status: "done" };
    if (live) return { key, title, status: "running" };
    if (stoppedMidway) return { key, title, status: "pending", note: "Stopped here" };
    return { key, title, status: "done" };
  });
  return [...steps, ...fixes];
}
