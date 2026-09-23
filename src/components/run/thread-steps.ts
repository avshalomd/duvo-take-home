import type { Plan, RunState } from "@/contracts/run";

// The run's plan as the thread draws it (src/components/thread/thread.tsx). The thread knows nothing about runs, so
// this is where a step's check becomes a flag and a finished run's last "running" step stops being worked on.

export type PlanThreadStep = { key: number; title: string; status: "pending" | "running" | "done" | "skipped"; note?: string; flag?: string };

// Below this, the per-step check thinks the step did not do what its title says (a probability from the checker).
const OFF_TRACK = 0.5;

export function threadSteps(plan: Plan, runStatus: string, stepChecks: RunState["stepChecks"]): PlanThreadStep[] {
  const live = runStatus === "queued" || runStatus === "running" || runStatus === "evaluating";
  const stoppedMidway = runStatus === "cancelled" || runStatus === "failed";

  return plan.steps.map((step) => {
    const out: PlanThreadStep = { key: step.index, title: step.title, status: step.status };
    if (step.note) out.note = step.note;

    // A run that ended cannot still be working: its bead would breathe for ever. A stopped or broken run says
    // where it stopped; a finished one simply never marked the step done.
    if (step.status === "running" && !live) {
      out.status = "pending";
      if (stoppedMidway) out.note = ["Stopped here", step.note].filter(Boolean).join(". ");
    }

    const check = stepChecks?.find((c) => c.stepIndex === step.index);
    if (step.status === "done" && check && check.onTrack < OFF_TRACK) out.flag = `This step may not have done what it says. ${check.note}`;
    return out;
  });
}
