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

// Outcomes that are not a failure: a doubt about one step of such a run only worried the person (qa-ux U22)
const NOT_FAILED = new Set(["pass", "pass_with_notes", "cannot_do", "needs_answer"]);

/**
 * Whether the glance view flags the steps the checker doubted (qa-ux U22, the owner's call): only once the run has
 * ended without passing - failed, stopped, not checked or not passed. On any other run the doubt, with the checker's
 * reason, is in Details; a live run has not passed or failed yet.
 */
export function showsStepDoubts(runStatus: string, headline: string | null): boolean {
  if (runStatus === "queued" || runStatus === "running" || runStatus === "evaluating") return false;
  return !(headline && NOT_FAILED.has(headline));
}

/** doubts: flag the steps the checker doubted (showsStepDoubts). */
export function threadSteps(plan: Plan | null, runStatus: string, stepChecks: RunState["stepChecks"], heals: Heal[] = [], doubts = true): PlanThreadStep[] {
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
    // the flag only: the checker's reason is a line in Details, beside the percentages
    if (doubts && step.status === "done" && check && check.onTrack < OFF_TRACK) out.flag = "This step may not have done what it says.";
    return out;
  });

  // Auto-heal: each attempt to fix the result is one more step on the same thread. Only the latest can be under way;
  // what the check found is under Why?, not here, because the run has not said pass or fail yet (his call).
  // Once the agent names an attempt by what it changed (describe_fix, qa-ai F14), that is its title and note: the
  // plan above stays as it was, and this step says honestly what the fix did.
  const fixes = heals.map((heal, i): PlanThreadStep => {
    const named = heal.stopped ? undefined : plan.fixes?.find((f) => f.attempt === heal.attempt);
    const title = named?.title ?? `Fix what the check found (attempt ${heal.attempt} of ${heal.max})`;
    const key = `heal-${heal.attempt}`;
    const note = named?.note ? { note: named.note } : {};
    if (heal.stopped) return { key, title, status: "skipped", note: stoppedLine(heal) };
    if (i < heals.length - 1) return { key, title, status: "done", ...note };
    if (live) return { key, title, status: "running", ...note };
    if (stoppedMidway) return { key, title, status: "pending", note: ["Stopped here", named?.note].filter(Boolean).join(". ") };
    return { key, title, status: "done", ...note };
  });
  return [...steps, ...fixes];
}
